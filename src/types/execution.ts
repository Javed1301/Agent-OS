/**
 * Execution types — canonical types for the execution store.
 */
export type ExecutionStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout";

/** SSE event types emitted by runner.py and relayed to clients */
export type SseEventType =
  | "status"
  | "log"
  | "result"
  | "error"
  | "warning"
  | "completed";

export interface SseEvent {
  type: SseEventType;
  data: unknown;
  executionId?: string;
  timestamp?: string;
}

/**
 * Full execution record stored in database/executions/exec_<id>.json
 */
export interface ExecutionRecord {
  id: string;
  agentId: string;
  input: Record<string, unknown>;
  status: ExecutionStatus;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  /** Absolute path to the raw log file for this execution */
  logPath: string;
  /** For file-output agents: map of filename → absolute moved path */
  outputFiles?: Record<string, string>;
  /** The final structured result emitted by runner.py */
  result?: unknown;
  error?: string;
  exitCode?: number;
}

/**
 * Lightweight index entry stored in database/executions/index.json
 * One entry per execution, updated atomically.
 */
export interface ExecutionIndexEntry {
  id: string;
  agentId: string;
  status: ExecutionStatus;
  startTime: string;
  endTime?: string;
  durationMs?: number;
}
