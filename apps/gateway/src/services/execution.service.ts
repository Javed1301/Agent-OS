/**
 * Execution Service
 *
 * Orchestrates agent execution:
 *   1. Create an isolated run directory (data/executions/<id>/)
 *   2. Write input.json
 *   3. Acquire per-WD mutex (for agents with fixed output filenames)
 *   4. Select adapter (python | rest)
 *   5. Start execution and route SSE events to consumers
 *   6. Persist result and release locks on completion
 *   7. Support live cancellation via tree-kill
 *   8. Stream buffered events to late-connecting SSE clients
 */

import fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import type { Response } from "express";
import type { AgentDefinition } from "../types/agent.js";
import type { ExecutionRecord, ExecutionStatus } from "../types/execution.js";
import { pythonAdapter } from "../adapters/python.js";
import { restAdapter } from "../adapters/rest.js";
import { storeRepository } from "../repositories/index.js";
import { buildSpawnEnv } from "./health.service.js";
import { runtimeService } from "./runtime.service.js";
import { environmentResolver } from "./environment-resolver.service.js";
import type { AdapterHandle, AgentAdapter } from "../adapters/base.js";

// ---------------------------------------------------------------------------
// Per-working-directory mutex
// Prevents concurrent executions of the same agent writing to fixed paths.
// ---------------------------------------------------------------------------

const wdLocks = new Map<string, Promise<void>>();

async function acquireWdLock(workingDir: string, execId: string, appendLog: (s: string) => void): Promise<() => void> {
  const msgReq = `[execution] Lock requested: ${workingDir} for ${execId}`;
  console.log(msgReq);
  appendLog(msgReq);

  const current = wdLocks.get(workingDir) ?? Promise.resolve();
  let release!: () => void;
  const next = current.then(
    () => new Promise<void>((res) => { release = res; })
  );
  wdLocks.set(workingDir, next);
  await current;

  const msgAcq = `[execution] Lock acquired: ${workingDir} for ${execId}`;
  console.log(msgAcq);
  appendLog(msgAcq);

  return () => {
    const msgRel = `[execution] Lock released: ${workingDir} for ${execId}`;
    console.log(msgRel);
    appendLog(msgRel);
    release();
  };
}

// ---------------------------------------------------------------------------
// Active executions — indexed by executionId
// ---------------------------------------------------------------------------

interface ActiveExecution {
  handle: AdapterHandle;
  releaseWdLock?: () => void;
  consumers: Response[];
  eventLog: Array<{ type: string; data: unknown; timestamp: string }>;
  finished: boolean;
  startTime: number;
  error?: string;
}

const activeExecutions = new Map<string, ActiveExecution>();

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function setSseHeaders(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();
}

function writeEvent(res: Response, type: string, data: unknown, execId: string): void {
  if (res.writableEnded) return;
  const event = JSON.stringify({
    type,
    data,
    executionId: execId,
    timestamp: new Date().toISOString(),
  });
  res.write(`data: ${event}\n\n`);
}

// ---------------------------------------------------------------------------
// Execution ID generator
// ---------------------------------------------------------------------------

function generateExecId(): string {
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `exec_${ts}_${uuidv4().slice(0, 8)}`;
}

// ---------------------------------------------------------------------------
// Broadcast an event to all active SSE consumers and record in eventLog
// ---------------------------------------------------------------------------

function broadcast(active: ActiveExecution, execId: string, type: string, data: unknown): void {
  const entry = { type, data, timestamp: new Date().toISOString() };
  active.eventLog.push(entry);
  for (const res of active.consumers) {
    writeEvent(res, type, data, execId);
  }
}

// ---------------------------------------------------------------------------
// Handle a terminal SSE event (completed / failed / cancelled)
// ---------------------------------------------------------------------------

async function handleTerminal(
  active: ActiveExecution,
  execId: string,
  status: ExecutionStatus,
  error?: string
): Promise<void> {
  if (active.finished) return;
  active.finished = true;

  console.log(`[execution] State -> ${status} (${execId})`);
  storeRepository.appendLog(execId, `[execution] State -> ${status}`);

  const endTime = new Date().toISOString();
  const durationMs = Date.now() - active.startTime;
  await storeRepository.updateStatus(execId, status, { endTime, durationMs, error });

  if (active.releaseWdLock) active.releaseWdLock();
  activeExecutions.delete(execId);

  for (const res of active.consumers) {
    if (!res.writableEnded) res.end();
  }

  await storeRepository.pruneOldExecutions();
}

// ---------------------------------------------------------------------------
// Public execution service
// ---------------------------------------------------------------------------

export const executionService = {
  _adapterOverride: undefined as AgentAdapter | undefined,
  /**
   * Start executing an agent. Returns the executionId immediately.
   * Execution is asynchronous; callers attach SSE via streamExecution().
   */
  async execute(
    agent: AgentDefinition,
    input: Record<string, unknown>
  ): Promise<string> {
    const id = generateExecId();
    const now = new Date().toISOString();
    const runDir = storeRepository.getRunDir(id);

    console.log(`[execution] Created ${id} for ${agent.id}`);
    console.log(`[execution] Dispatching ${id}`);

    const record: ExecutionRecord = {
      id,
      agentId: agent.id,
      input,
      status: "queued",
      startTime: now,
      runDir,
      logPath: storeRepository.getLogPath(id),
    };

    await storeRepository.create(record, input);
    storeRepository.appendLog(id, `[execution] Created ${id} for ${agent.id}`);
    storeRepository.appendLog(id, `[execution] Dispatching ${id}`);

    const active: ActiveExecution = {
      handle: { cancel: () => {} },
      consumers: [],
      eventLog: [
        { type: "status", data: "queued", timestamp: now },
        { type: "log", data: `[execution] Created ${id} for ${agent.id}`, timestamp: now },
        { type: "log", data: `[execution] Dispatching ${id}`, timestamp: now },
      ],
      finished: false,
      startTime: Date.now(),
    };
    activeExecutions.set(id, active);

    void this._runAsync(agent, input, id, runDir, active);

    return id;
  },

  async _runAsync(
    agent: AgentDefinition,
    input: Record<string, unknown>,
    id: string,
    runDir: string,
    active: ActiveExecution
  ): Promise<void> {
    const appendLog = (line: string) => storeRepository.appendLog(id, line);
    const startTime = new Date().toISOString();

    let isLockAcquired = false;
    const queueTimer = setTimeout(() => {
      if (!isLockAcquired) {
        const warnMsg = `[execution] Queued state warning: execution ${id} queued for >5s. Waiting for working-directory lock on ${agent.workingDirectory}...`;
        console.warn(warnMsg);
        appendLog(warnMsg);
        broadcast(active, id, "warning", `Execution queued for >5s. Waiting for working-directory lock...`);
      }
    }, 5000);

    // Acquire wd lock for agents with fixed-filename output files
    if (agent.usesWdLock) {
      broadcast(active, id, "status", "queued");
      const release = await acquireWdLock(agent.workingDirectory, id, appendLog);
      active.releaseWdLock = release;
    }
    isLockAcquired = true;
    clearTimeout(queueTimer);

    console.log(`[execution] State -> running (${id})`);
    appendLog(`[execution] State -> running`);
    await storeRepository.updateStatus(id, "running", { startTime });
    broadcast(active, id, "status", "running");

    const updatedAgent = { ...agent };

    if (agent.type === "python") {
      try {
        appendLog(`[environment] Resolving execution environment for agent: ${agent.id}`);
        const res = await environmentResolver.resolve(
          agent.id,
          agent.logicalPath || agent.workingDirectory,
          agent.entrypoint
        );

        let interpreterPath = "";
        if (res.action === "REUSE_EXISTING") {
          interpreterPath = res.executablePath;
          appendLog(`[environment] Reusing compatible environment: ${interpreterPath}`);
          broadcast(active, id, "log", `[environment] Reusing compatible environment: ${interpreterPath}`);
        } else {
          appendLog(`[environment] No compatible local environment found. Resolving fallback managed runtime...`);
          broadcast(active, id, "log", `[environment] Resolving fallback managed runtime...`);
          const buildResult = await runtimeService.resolveRuntime(
            res.resolvedSource.sourceRoot,
            agent.id,
            "3.11",
            (msg) => {
              appendLog(msg);
              broadcast(active, id, "log", msg);
            }
          );
          interpreterPath = buildResult.interpreterPath;
          appendLog(`[environment] Fallback managed runtime resolved: ${interpreterPath}`);
          broadcast(active, id, "log", `[environment] Fallback managed runtime resolved: ${interpreterPath}`);
        }

        updatedAgent.workingDirectory = res.resolvedSource.sourceRoot;
        updatedAgent.resolvedPath = res.resolvedSource.sourceRoot;
        updatedAgent.interpreterPath = interpreterPath;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        appendLog(`[environment] Resolution failed: ${msg}`);
        broadcast(active, id, "error", `Environment resolution failed: ${msg}`);
        broadcast(active, id, "status", "failed");
        handleTerminal(active, id, "failed", msg);
        return;
      }
    }

    // Touch runtime lastUsedAt if agent has an associated runtime
    if (updatedAgent.type === "python" && updatedAgent.workingDirectory) {
      try {
        const depInfo = runtimeService.detectDependencies(updatedAgent.workingDirectory);
        if (depInfo.runtimeHash && depInfo.runtimeHash !== "none") {
          runtimeService.associateAgent(depInfo.runtimeHash, updatedAgent.id);
        }
      } catch {
        /* ignore */
      }
    }

    // Ensure run directory exists
    fs.mkdirSync(runDir, { recursive: true });
    fs.mkdirSync(`${runDir}/artifacts`, { recursive: true });

    const spawnEnv =
      updatedAgent.type === "python"
        ? buildSpawnEnv(updatedAgent)
        : (process.env as NodeJS.ProcessEnv);

    const fakeRes = buildFakeResponse(active, id, appendLog);

    const ctx = {
      execution: { ...(await storeRepository.getById(id))! },
      agent: updatedAgent,
      sseRes: fakeRes as unknown as Response,
      runDir,
      appendLog,
      spawnEnv,
    };

    // Choose adapter
    const adapter = (this as any)._adapterOverride || (updatedAgent.type === "python" ? pythonAdapter : restAdapter);
    let handle: AdapterHandle;

    try {
      handle = adapter.execute(ctx);
      active.handle = handle;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appendLog(`[execution] Adapter start failed: ${msg}`);
      broadcast(active, id, "error", msg);
      broadcast(active, id, "status", "failed");
      handleTerminal(active, id, "failed", msg);
      return;
    }
  },

  /**
   * Attach an SSE response to a running or queued execution.
   * Flushes buffered events, then streams live events.
   */
  async streamExecution(id: string, res: Response): Promise<boolean> {
    console.log(`[stream] client connected ${id}`);
    const active = activeExecutions.get(id);
    if (active) {
      setSseHeaders(res);
      console.log(`[stream] replaying buffered logs ${id}`);
      for (const ev of active.eventLog) {
        if (ev.type === "status") {
          console.log(`[stream] emitting status ${id} ${ev.data}`);
        } else if (ev.type === "log") {
          console.log(`[stream] emitting log ${id}`);
        }
        writeEvent(res, ev.type, ev.data, id);
      }
      if (active.finished) {
        if (!res.writableEnded) res.end();
        console.log(`[stream] client disconnected ${id}`);
      } else {
        active.consumers.push(res);
        res.on("close", () => {
          console.log(`[stream] client disconnected ${id}`);
          const idx = active.consumers.indexOf(res);
          if (idx !== -1) active.consumers.splice(idx, 1);
        });
      }
      return true;
    }

    // Execution already finished — serve from store
    const record = await storeRepository.getById(id);
    if (!record) return false;
    setSseHeaders(res);
    console.log(`[stream] replaying buffered logs ${id} (stored)`);
    console.log(`[stream] emitting status ${id} ${record.status}`);
    writeEvent(res, "status", record.status, id);
    if (record.result) writeEvent(res, "result", record.result, id);
    res.end();
    console.log(`[stream] client disconnected ${id}`);
    return true;
  },

  /**
   * Cancel a running execution.
   */
  cancel(id: string): boolean {
    const active = activeExecutions.get(id);
    if (!active || active.finished) return false;

    broadcast(active, id, "status", "cancelled");
    active.handle.cancel();
    void handleTerminal(active, id, "cancelled");
    return true;
  },
};

// ---------------------------------------------------------------------------
// Fake Response — routes adapter SSE writes through broadcast()
// ---------------------------------------------------------------------------

interface FakeResponse {
  writableEnded: boolean;
  write(chunk: string): boolean;
  end(): void;
  setHeader(name: string, value: string): void;
  flushHeaders(): void;
}

function buildFakeResponse(
  active: ActiveExecution,
  execId: string,
  appendLog: (line: string) => void
): FakeResponse {
  let ended = false;

  return {
    get writableEnded() { return ended; },
    write(chunk: string): boolean {
      if (ended) return false;
      if (chunk.startsWith("data: ")) {
        const jsonStr = chunk.slice(6).trim();
        try {
          const parsed = JSON.parse(jsonStr) as { type: string; data: unknown };
          broadcast(active, execId, parsed.type, parsed.data);

          if (parsed.type === "error") {
            active.error = typeof parsed.data === "string"
              ? parsed.data
              : (parsed.data && typeof parsed.data === "object" && "message" in parsed.data)
                ? String((parsed.data as any).message)
                : JSON.stringify(parsed.data);
          }
          if (parsed.type === "result") {
            storeRepository.saveResult(execId, parsed.data).catch((err) => {
              console.error(`[execution] Failed to save result dynamically:`, err);
            });
          }
          if (
            parsed.type === "status" &&
            (parsed.data === "completed" || parsed.data === "failed")
          ) {
            const status: ExecutionStatus =
              parsed.data === "completed" ? "completed" : "failed";
            void handleTerminal(active, execId, status, status === "failed" ? active.error : undefined);
            ended = true;
          }
        } catch {
          appendLog(`[adapter raw] ${chunk}`);
        }
      }
      return true;
    },
    end(): void {
      ended = true;
      if (!active.finished) {
        void handleTerminal(active, execId, "failed", "Adapter closed without status event.");
      }
    },
    setHeader(_name: string, _value: string): void { /* no-op */ },
    flushHeaders(): void { /* no-op */ },
  };
}
