/**
 * Integration test script for the Agent Dashboard Gateway.
 *
 * Tests:
 *  1. GET /health — gateway is up
 *  2. GET /api/agents — all 6 agents are registered
 *  3. GET /api/agents/:id/health — health checks for all agents
 *  4. POST /api/agents/hate-speech-detector/execute + SSE stream (REAL API call #1)
 *  5. POST /api/agents/hate-speech-detector/execute + mid-stream cancel (REAL API call #2)
 *  6. GET /api/executions — execution history shows both executions
 *
 * Cost constraint: maximum 2 real API calls (hate-speech-detector only).
 * All other agents: health-check only (no execution).
 */

import http from "node:http";

const BASE = "http://localhost:8080";
const PASS = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";
const INFO = "\x1b[34mℹ\x1b[0m";

let passed = 0;
let failed = 0;

function log(symbol: string, msg: string) {
  console.log(`  ${symbol} ${msg}`);
}

function assert(condition: boolean, msg: string) {
  if (condition) {
    log(PASS, msg);
    passed++;
  } else {
    log(FAIL, `FAILED: ${msg}`);
    failed++;
  }
}

function request(
  method: string,
  urlPath: string,
  body?: unknown
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const payload = body != null ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload).toString();
    }
    const req = http.request(url, { method, headers, timeout: 10_000 }, (res) => {
      let data = "";
      res.on("data", (c: Buffer) => { data += c.toString(); });
      res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    if (payload) req.write(payload);
    req.end();
  });
}

/** Read SSE events from a stream until the first `status: completed/failed/cancelled` */
function readSseStream(
  urlPath: string,
  onEvent: (event: { type: string; data: unknown }) => void,
  cancelAfterMs?: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const req = http.request(url, { method: "GET", timeout: 300_000 }, (res) => {
      let buffer = "";
      let done = false;

      if (cancelAfterMs != null) {
        setTimeout(() => {
          if (!done) {
            req.destroy();
            resolve();
          }
        }, cancelAfterMs);
      }

      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as { type: string; data: unknown };
            onEvent(event);
            if (
              event.type === "status" &&
              (event.data === "completed" || event.data === "failed" || event.data === "cancelled")
            ) {
              done = true;
              resolve();
            }
          } catch { /* skip non-JSON */ }
        }
      });
      res.on("end", resolve);
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  console.log("\n=== Agent Dashboard Gateway — Integration Tests ===\n");

  // ─── Test 1: Gateway health ────────────────────────────────────────────
  console.log("1. Gateway health check");
  try {
    const res = await request("GET", "/health");
    const body = JSON.parse(res.body) as { status: string };
    assert(res.statusCode === 200, `HTTP 200 from /health`);
    assert(body.status === "ok", `body.status === "ok"`);
  } catch (err) {
    log(FAIL, `Gateway not reachable: ${err}`);
    failed += 2;
  }

  // ─── Test 2: All 6 agents registered ─────────────────────────────────
  console.log("\n2. Agent registry");
  try {
    const res = await request("GET", "/api/agents");
    const body = JSON.parse(res.body) as { agents: { id: string }[] };
    assert(res.statusCode === 200, `HTTP 200 from /api/agents`);
    const expectedIds = [
      "hate-speech-detector",
      "devops-log-analyzer",
      "stock-analyst",
      "podcaster-crew",
      "myntra-rag",
      "meeting-notes-api",
    ];
    for (const id of expectedIds) {
      assert(body.agents.some((a) => a.id === id), `Agent '${id}' registered`);
    }
  } catch (err) {
    log(FAIL, `Registry check failed: ${err}`);
    failed++;
  }

  // ─── Test 3: Health checks for all agents ────────────────────────────
  console.log("\n3. Per-agent health checks");
  const agentIds = [
    "hate-speech-detector",
    "devops-log-analyzer",
    "stock-analyst",
    "podcaster-crew",
    "myntra-rag",
    "meeting-notes-api",
  ];
  for (const id of agentIds) {
    try {
      const res = await request("GET", `/api/agents/${id}/health`);
      const body = JSON.parse(res.body) as { status: string; detail?: string };
      log(
        body.status === "available" ? PASS : INFO,
        `${id}: status=${body.status}${body.detail ? ` — ${body.detail.slice(0, 80)}` : ""}`
      );
    } catch (err) {
      log(FAIL, `Health check for '${id}' threw: ${err}`);
      failed++;
    }
  }

  // ─── Test 4: Execute hate-speech-detector + stream (REAL API call #1) ─
  console.log("\n4. Execute hate-speech-detector (real API call #1)");
  let execId1 = "";
  try {
    const res = await request("POST", "/api/agents/hate-speech-detector/execute", {
      text: "Public libraries are important resources for everyone in the city.",
    });
    const body = JSON.parse(res.body) as { executionId: string; status: string };
    assert(res.statusCode === 202, `HTTP 202 from /execute`);
    assert(typeof body.executionId === "string", `executionId returned`);
    execId1 = body.executionId;
    log(INFO, `executionId: ${execId1}`);

    // Stream events
    const events: { type: string; data: unknown }[] = [];
    console.log(`   Streaming SSE for ${execId1}...`);
    await readSseStream(`/api/executions/${execId1}/stream`, (ev) => {
      log(INFO, `  SSE event: type=${ev.type}, data=${JSON.stringify(ev.data).slice(0, 120)}`);
      events.push(ev);
    });

    const finalStatus = events.findLast((e: { type: string; data: unknown }) => e.type === "status")?.data;
    assert(finalStatus === "completed" || finalStatus === "failed", `Terminal status event received: ${finalStatus}`);
    const hasResult = events.some((e) => e.type === "result");
    assert(hasResult, `Result event received in stream`);
  } catch (err) {
    log(FAIL, `Execute test failed: ${err}`);
    failed++;
  }

  // ─── Test 5: Execute + cancel (REAL API call #2) ──────────────────────
  console.log("\n5. Execute hate-speech-detector + cancel (real API call #2)");
  try {
    const res = await request("POST", "/api/agents/hate-speech-detector/execute", {
      text: "People from that race are all untrustworthy and should not be allowed to work.",
    });
    const body = JSON.parse(res.body) as { executionId: string };
    const execId2 = body.executionId;
    log(INFO, `executionId: ${execId2}`);

    // Cancel after 3 seconds
    const cancelTimer = setTimeout(async () => {
      try {
        const cancelRes = await request("POST", `/api/executions/${execId2}/cancel`);
        const cancelBody = JSON.parse(cancelRes.body) as { status: string };
        assert(cancelRes.statusCode === 200, `Cancel returned HTTP 200`);
        assert(cancelBody.status === "cancelled", `Cancel body.status === "cancelled"`);
      } catch (err) {
        log(FAIL, `Cancel request failed: ${err}`);
        failed++;
      }
    }, 3000);

    // Stream and look for cancelled event
    const cancelEvents: { type: string; data: unknown }[] = [];
    await readSseStream(`/api/executions/${execId2}/stream`, (ev) => {
      log(INFO, `  SSE cancel-test event: type=${ev.type}`);
      cancelEvents.push(ev);
    }, 15_000); // Give up after 15s

    clearTimeout(cancelTimer);
    const wasCancelled = cancelEvents.some(
      (e) => e.type === "status" && e.data === "cancelled"
    );
    assert(wasCancelled, `SSE stream received cancelled status event`);
  } catch (err) {
    log(FAIL, `Cancel test failed: ${err}`);
    failed++;
  }

  // ─── Test 6: Execution history ────────────────────────────────────────
  console.log("\n6. Execution history");
  try {
    const res = await request("GET", "/api/executions");
    const body = JSON.parse(res.body) as { executions: { id: string }[] };
    assert(res.statusCode === 200, `HTTP 200 from /api/executions`);
    assert(body.executions.length >= 2, `At least 2 executions in history`);
    if (execId1) {
      assert(body.executions.some((e) => e.id === execId1), `First execution appears in history`);
    }
  } catch (err) {
    log(FAIL, `History check failed: ${err}`);
    failed++;
  }

  // ─── Summary ──────────────────────────────────────────────────────────
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
