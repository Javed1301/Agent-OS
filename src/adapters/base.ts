import type { AgentDefinition } from "../types/agent.js";
import type { ExecutionRecord } from "../types/execution.js";
import type { Response } from "express";

/** Common interface that all adapters implement */
export interface AdapterHandle {
  /** Kill the running process / request. Returns immediately. */
  cancel(): void;
}

export interface AdapterContext {
  execution: ExecutionRecord;
  agent: AgentDefinition;
  /** Express response object for the SSE stream (already has SSE headers set) */
  sseRes: Response;
  /** Called by the adapter when it wants to append a line to the log file */
  appendLog: (line: string) => void;
  /** Full per-execution output directory (gateway creates this, runner moves files here) */
  outputDir: string;
  /** The resolved spawn environment built by buildSpawnEnv() */
  spawnEnv: NodeJS.ProcessEnv;
}

export interface Adapter {
  start(ctx: AdapterContext): AdapterHandle;
}
