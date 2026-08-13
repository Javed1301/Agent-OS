import type { Response } from "express";
import type { AgentDefinition } from "../types/agent.js";
import type { ExecutionRecord } from "../types/execution.js";

// ---------------------------------------------------------------------------
// Unified Adapter Interface
// ---------------------------------------------------------------------------

/** Result returned by an adapter after execution completes. */
export interface AdapterResult {
  status: "completed" | "failed" | "cancelled";
  result?: unknown;
  error?: string;
  exitCode?: number;
  outputFiles?: Record<string, string>;
}

/** Per-execution health result from an adapter. */
export interface AdapterHealth {
  status: "available" | "unavailable" | "misconfigured" | "unknown";
  detail?: string;
  interpreterPath?: string;
}

/**
 * Context passed into adapter.execute() containing everything the adapter
 * needs to run the agent and stream results.
 */
export interface AdapterContext {
  execution: ExecutionRecord;
  agent: AgentDefinition;
  /** Live SSE Response to write events to. May be a FakeResponse for internal routing. */
  sseRes: Response;
  /** Absolute path to the isolated run directory: data/executions/<id>/ */
  runDir: string;
  /** Function to append a line to the execution's log file */
  appendLog: (line: string) => void;
  /** Merged env object to use when spawning subprocesses */
  spawnEnv: NodeJS.ProcessEnv;
}

/**
 * Handle returned by adapter.execute() that allows cancellation.
 */
export interface AdapterHandle {
  /** Terminate the underlying process/request. No-op if already finished. */
  cancel(): void;
}

/**
 * The unified agent adapter interface.
 *
 * Every adapter (Python subprocess, REST, Node subprocess, CLI, etc.) must
 * implement this interface. The execution engine calls only these methods.
 *
 * - execute(): starts the agent, streams events via ctx.sseRes, returns a handle.
 * - health(): checks whether the agent is runnable right now.
 *
 * Adapters must emit SSE events through ctx.sseRes using the format:
 *   data: {"type":"<type>","data":<payload>,"executionId":"<id>","timestamp":"<iso>"}\n\n
 *
 * Terminal events:
 *   {"type":"status","data":"completed"} — successful finish
 *   {"type":"status","data":"failed"}    — error finish
 *   {"type":"status","data":"cancelled"} — cancellation
 */
export interface AgentAdapter {
  execute(ctx: AdapterContext): AdapterHandle;
  health(agent: AgentDefinition): Promise<AdapterHealth>;
  cancel?(executionId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Legacy alias — keeps existing code that uses AdapterHandle working.
// ---------------------------------------------------------------------------
export type { AdapterHandle as LegacyAdapterHandle };

/** @deprecated Use AdapterContext instead */
export interface Adapter {
  start(ctx: AdapterContext): AdapterHandle;
}
