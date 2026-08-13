import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v4 as uuidv4 } from "uuid";
import type { Response } from "express";
import type { AgentDefinition } from "../types/agent.js";
import type { ExecutionRecord, ExecutionStatus } from "../types/execution.js";
import { pythonAdapter } from "../adapters/python.js";
import { restAdapter } from "../adapters/rest.js";
import { storeService } from "./store.service.js";
import { buildSpawnEnv } from "./health.service.js";
import type { AdapterHandle } from "../adapters/base.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.resolve(__dirname, "../../database");

// ---------------------------------------------------------------------------
// Per-working-directory mutex
// Prevents concurrent executions of the same agent writing to fixed paths.
// ---------------------------------------------------------------------------

const wdLocks = new Map<string, Promise<void>>();

async function acquireWdLock(workingDir: string): Promise<() => void> {
  const current = wdLocks.get(workingDir) ?? Promise.resolve();
  let release!: () => void;
  const next = current.then(
    () => new Promise<void>((res) => { release = res; })
  );
  wdLocks.set(workingDir, next);
  await current; // wait for previous execution in this cwd to finish
  return release;
}

// ---------------------------------------------------------------------------
// Active executions — indexed by executionId
// ---------------------------------------------------------------------------

interface ActiveExecution {
  handle: AdapterHandle;
  releaseWdLock?: () => void;
  /** Live SSE consumers waiting for events. May be empty until client connects. */
  consumers: Response[];
  eventLog: Array<{ type: string; data: unknown; timestamp: string }>;
  finished: boolean;
  startTime: number;
}

const activeExecutions = new Map<string, ActiveExecution>();
const cancelledSet = new Set<string>();

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

function handleTerminal(
  active: ActiveExecution,
  execId: string,
  status: ExecutionStatus,
  error?: string
): void {
  if (active.finished) return;
  active.finished = true;

  const endTime = new Date().toISOString();
  const durationMs = Date.now() - active.startTime;
  storeService.updateStatus(execId, status, { endTime, durationMs, error });

  if (active.releaseWdLock) active.releaseWdLock();
  activeExecutions.delete(execId);

  // Close all consumer streams
  for (const res of active.consumers) {
    if (!res.writableEnded) res.end();
  }

  storeService.pruneOldExecutions();
}

// ---------------------------------------------------------------------------
// Public execution service
// ---------------------------------------------------------------------------

export const executionService = {
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
    const outputDir = path.join(DB_DIR, "executions", "outputs", id);

    const record: ExecutionRecord = {
      id,
      agentId: agent.id,
      input,
      status: "queued",
      startTime: now,
      logPath: storeService.getLogPath(id),
    };

    storeService.createExecution(record);

    // Set up active execution entry before kicking off async work
    const active: ActiveExecution = {
      handle: { cancel: () => {} }, // placeholder until adapter starts
      consumers: [],
      eventLog: [],
      finished: false,
      startTime: Date.now(),
    };
    activeExecutions.set(id, active);

    void this._runAsync(agent, input, id, outputDir, active);

    return id;
  },

  async _runAsync(
    agent: AgentDefinition,
    input: Record<string, unknown>,
    id: string,
    outputDir: string,
    active: ActiveExecution
  ): Promise<void> {
    const appendLog = (line: string) => storeService.appendLog(id, line);
    const startTime = new Date().toISOString();

    // Acquire wd lock for agents with fixed-filename output files
    if (agent.usesWdLock) {
      appendLog(`[gateway] Waiting for working-directory lock: ${agent.workingDirectory}`);
      broadcast(active, id, "status", "queued");
      const release = await acquireWdLock(agent.workingDirectory);
      active.releaseWdLock = release;
      appendLog(`[gateway] Working-directory lock acquired.`);
    }

    storeService.updateStatus(id, "running", { startTime });
    broadcast(active, id, "status", "started");

    // Create per-execution output directory
    fs.mkdirSync(outputDir, { recursive: true });

    const spawnEnv =
      agent.type === "python"
        ? buildSpawnEnv(agent)
        : (process.env as NodeJS.ProcessEnv);

    // Build a fake Response-like object that routes writes through broadcast()
    const fakeRes = buildFakeResponse(active, id, appendLog);

    const ctx = {
      execution: { ...storeService.getById(id)! },
      agent,
      sseRes: fakeRes as unknown as Response,
      appendLog,
      outputDir,
      spawnEnv,
    };

    // Choose adapter
    const adapter = agent.type === "python" ? pythonAdapter : restAdapter;
    let handle: AdapterHandle;

    try {
      handle = adapter.start(ctx);
      active.handle = handle;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appendLog(`[gateway] Adapter start failed: ${msg}`);
      broadcast(active, id, "error", msg);
      broadcast(active, id, "status", "failed");
      handleTerminal(active, id, "failed", msg);
      return;
    }

    // The adapter emits events through fakeRes.write() — which routes to broadcast().
    // Terminal detection happens inside fakeRes.
  },

  /**
   * Attach an SSE response to a running or queued execution.
   * Flushes buffered events, then streams live events.
   */
  streamExecution(id: string, res: Response): boolean {
    const active = activeExecutions.get(id);
    if (active) {
      setSseHeaders(res);
      // Replay buffered events
      for (const ev of active.eventLog) {
        writeEvent(res, ev.type, ev.data, id);
      }
      if (active.finished) {
        if (!res.writableEnded) res.end();
      } else {
        active.consumers.push(res);
        // Clean up when client disconnects
        res.on("close", () => {
          const idx = active.consumers.indexOf(res);
          if (idx !== -1) active.consumers.splice(idx, 1);
        });
      }
      return true;
    }

    // Execution has already finished — serve from store
    const record = storeService.getById(id);
    if (!record) return false;
    setSseHeaders(res);
    writeEvent(res, "status", record.status, id);
    if (record.result) writeEvent(res, "result", record.result, id);
    res.end();
    return true;
  },

  /**
   * Cancel a running execution.
   * Immediately emits { type: "status", data: "cancelled" } to all SSE consumers
   * and terminates the subprocess via tree-kill before the stream closes.
   */
  cancel(id: string): boolean {
    const active = activeExecutions.get(id);
    if (!active || active.finished) return false;

    cancelledSet.add(id);

    // Emit cancelled event to all attached consumers before killing
    broadcast(active, id, "status", "cancelled");
    active.handle.cancel();

    handleTerminal(active, id, "cancelled");
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
      // Each SSE frame: "data: <json>\n\n"
      if (chunk.startsWith("data: ")) {
        const jsonStr = chunk.slice(6).trim();
        try {
          const parsed = JSON.parse(jsonStr) as { type: string; data: unknown };
          broadcast(active, execId, parsed.type, parsed.data);

          // Handle terminal events
          if (parsed.type === "result") {
            storeService.saveResult(execId, parsed.data);
          }
          if (
            parsed.type === "status" &&
            (parsed.data === "completed" || parsed.data === "failed")
          ) {
            const status: ExecutionStatus =
              parsed.data === "completed" ? "completed" : "failed";
            handleTerminal(active, execId, status);
            ended = true;
          }
        } catch {
          // Non-JSON chunk — forward as raw log
          appendLog(`[adapter raw] ${chunk}`);
        }
      }
      return true;
    },
    end(): void {
      ended = true;
      if (!active.finished) {
        // Adapter closed without emitting a status event — treat as failed
        handleTerminal(active, execId, "failed", "Adapter closed without status event.");
      }
    },
    setHeader(_name: string, _value: string): void { /* no-op */ },
    flushHeaders(): void { /* no-op */ },
  };
}
