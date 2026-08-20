import type { ExecutionRecord, ExecutionIndexEntry, ExecutionStatus } from "../types/execution.js";

export interface IExecutionRepository {
  init(): Promise<void> | void;
  create(record: ExecutionRecord, input: Record<string, unknown>): Promise<void>;
  updateStatus(id: string, status: ExecutionStatus, fields?: Partial<ExecutionRecord>): Promise<void>;
  saveResult(id: string, result: unknown, outputFiles?: Record<string, string>): Promise<void>;
  getById(id: string): Promise<ExecutionRecord | undefined>;
  list(agentId?: string): Promise<ExecutionIndexEntry[]>;
  getRunDir(id: string): string;
  getLogPath(id: string): string;
  appendLog(id: string, line: string): void;
  pruneOldExecutions(): Promise<void>;
}
