import type { IExecutionRepository } from "./types.js";
import type { ExecutionRecord, ExecutionIndexEntry, ExecutionStatus } from "../types/execution.js";
import { storeService } from "../services/store.service.js";

export class JsonExecutionRepository implements IExecutionRepository {
  init(): void {
    return storeService.init();
  }

  async create(record: ExecutionRecord, input: Record<string, unknown>): Promise<void> {
    return storeService.createExecution(record, input);
  }

  async updateStatus(id: string, status: ExecutionStatus, fields?: Partial<ExecutionRecord>): Promise<void> {
    return storeService.updateStatus(id, status, fields);
  }

  async saveResult(id: string, result: unknown, outputFiles?: Record<string, string>): Promise<void> {
    return storeService.saveResult(id, result, outputFiles);
  }

  async getById(id: string): Promise<ExecutionRecord | undefined> {
    return storeService.getById(id);
  }

  async list(agentId?: string): Promise<ExecutionIndexEntry[]> {
    return storeService.list(agentId);
  }

  getRunDir(id: string): string {
    return storeService.getRunDir(id);
  }

  getLogPath(id: string): string {
    return storeService.getLogPath(id);
  }

  appendLog(id: string, line: string): void {
    return storeService.appendLog(id, line);
  }

  async pruneOldExecutions(): Promise<void> {
    return storeService.pruneOldExecutions();
  }
}
