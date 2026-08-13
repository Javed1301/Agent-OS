/**
 * RestApiAdapter
 *
 * Communicates with a FastAPI (or any REST) service running independently.
 * Does NOT spawn or manage the process.
 *
 * Execution flow:
 *   POST /generate-meeting-notes → receive job_id
 *   Poll GET /meeting-notes/jobs/<job_id> every 2s until status != GENERATING
 *   Emit SSE events throughout.
 *
 * Cancellation: sets a flag; next poll loop iteration exits cleanly.
 *
 * Implements the unified AgentAdapter interface.
 */

import http from "node:http";
import https from "node:https";
import type { AgentAdapter, AdapterContext, AdapterHandle, AdapterHealth } from "./base.js";
import type { AgentDefinition } from "../types/agent.js";

export const restAdapter: AgentAdapter = {
  execute(ctx: AdapterContext): AdapterHandle {
    const { execution, agent, sseRes, appendLog } = ctx;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    let rawBaseUrl = (agent.configuration as { baseUrl?: string } | undefined)?.baseUrl
      ?? agent.entrypoint;
    if (process.env["DOCKER_ENV"] === "true") {
      rawBaseUrl = rawBaseUrl.replace(/localhost|127\.0\.0\.1/g, "host.docker.internal");
    }
    const baseUrl = rawBaseUrl;

    const internalSecret =
      (agent.configuration as { internalSecret?: string } | undefined)?.internalSecret
      ?? process.env["INTERNAL_SECRET"]
      ?? "";

    function emit(type: string, data: unknown): void {
      if (sseRes.writableEnded) return;
      const event = JSON.stringify({
        type,
        data,
        executionId: execution.id,
        timestamp: new Date().toISOString(),
      });
      sseRes.write(`data: ${event}\n\n`);
    }

    function request(
      method: string,
      urlPath: string,
      body?: unknown
    ): Promise<{ statusCode: number; body: string }> {
      return new Promise((resolve, reject) => {
        const fullUrl = new URL(urlPath, baseUrl);
        const client = fullUrl.protocol === "https:" ? https : http;
        const payload = body != null ? JSON.stringify(body) : undefined;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
        };
        if (internalSecret) headers["x-internal-secret"] = internalSecret;
        if (payload) headers["Content-Length"] = Buffer.byteLength(payload).toString();

        const req = client.request(
          fullUrl,
          { method, headers, timeout: 10_000 },
          (res) => {
            let data = "";
            res.on("data", (c: Buffer) => { data += c.toString(); });
            res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
          }
        );
        req.on("error", reject);
        req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
        if (payload) req.write(payload);
        req.end();
      });
    }

    async function run(): Promise<void> {
      try {
        emit("status", "started");
        appendLog("[rest] Starting execution via REST API");

        const transcriptId = String(execution.input["transcript_id"] ?? "");
        if (!transcriptId) {
          throw new Error("Input 'transcript_id' is required.");
        }

        const startRes = await request("POST", "/generate-meeting-notes", {
          transcript_id: transcriptId,
        });
        if (startRes.statusCode !== 202 && startRes.statusCode !== 200) {
          throw new Error(`POST /generate-meeting-notes returned HTTP ${startRes.statusCode}: ${startRes.body}`);
        }
        const startData = JSON.parse(startRes.body) as { job_id: string; status: string };
        const jobId = startData.job_id;
        appendLog(`[rest] Job started: ${jobId}`);
        emit("log", `Job created: ${jobId}`);

        const poll = (): Promise<void> =>
          new Promise<void>((resolve, reject) => {
            async function tick(): Promise<void> {
              if (cancelled) {
                emit("status", "cancelled");
                resolve();
                return;
              }
              try {
                const res = await request("GET", `/meeting-notes/jobs/${jobId}`);
                const job = JSON.parse(res.body) as {
                  status: string;
                  result?: unknown;
                  error?: string;
                };
                appendLog(`[rest] Job status: ${job.status}`);
                emit("log", `Job status: ${job.status}`);

                if (job.status === "GENERATING") {
                  pollTimer = setTimeout(tick, 2000);
                } else if (job.status === "COMPLETED") {
                  emit("result", job.result);
                  emit("status", "completed");
                  resolve();
                } else {
                  throw new Error(`Job failed with status '${job.status}': ${job.error ?? ""}`);
                }
              } catch (err) {
                reject(err);
              }
            }
            void tick();
          });

        await poll();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        appendLog(`[rest] Error: ${msg}`);
        emit("error", msg);
        emit("status", "failed");
        throw err;
      }
    }

    void run();

    return {
      cancel(): void {
        cancelled = true;
        if (pollTimer != null) {
          clearTimeout(pollTimer);
          pollTimer = null;
        }
      },
    };
  },

  async health(agent: AgentDefinition): Promise<AdapterHealth> {
    const endpoint = agent.healthCheck.endpoint;
    if (!endpoint) {
      return { status: "misconfigured", detail: "No health endpoint configured." };
    }
    return { status: "available", detail: `Endpoint configured: ${endpoint}` };
  },
};
