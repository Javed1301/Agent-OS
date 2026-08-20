import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IExecutionRepository } from "./types.js";
import type { ExecutionRecord, ExecutionIndexEntry, ExecutionStatus } from "../types/execution.js";
import { registryService } from "../services/registry.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = process.env["WORKSPACE_ROOT"]
  ? path.resolve(process.env["WORKSPACE_ROOT"])
  : path.resolve(__dirname, "../../../..");
const DATA_DIR = path.join(WORKSPACE_ROOT, "data");
const EXEC_DIR = path.join(DATA_DIR, "executions");

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "file:../../../data/agent-os.db",
    },
  },
});

export class PrismaExecutionRepository implements IExecutionRepository {
  async init(): Promise<void> {
    try {
      await prisma.$executeRawUnsafe('PRAGMA journal_mode=WAL;');
      await prisma.$executeRawUnsafe('PRAGMA busy_timeout=5000;');
      await prisma.$executeRawUnsafe('PRAGMA foreign_keys=ON;');
      console.log('[store-prisma] WAL mode, busy_timeout=5000, and foreign keys enabled.');
    } catch (err) {
      console.error('[store-prisma] Failed to initialize SQLite PRAGMAs:', err);
    }
  }

  async create(record: ExecutionRecord, input: Record<string, unknown>): Promise<void> {
    const dir = this.getRunDir(record.id);

    // 1. Filesystem directory setup and input.json write
    fs.mkdirSync(path.join(dir, "artifacts"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "input.json"),
      JSON.stringify(input, null, 2),
      "utf-8"
    );

    // 2. Upsert Agent metadata to satisfy foreign key constraints
    const agent = registryService.getAgent(record.agentId);
    const agentName = agent ? agent.name : record.agentId;

    await prisma.agent.upsert({
      where: { id: record.agentId },
      update: { name: agentName },
      create: { id: record.agentId, name: agentName },
    });

    // 3. Create database row
    await prisma.execution.create({
      data: {
        id: record.id,
        agentId: record.agentId,
        status: record.status,
        startTime: new Date(record.startTime),
        input: JSON.stringify(input),
        endTime: record.endTime ? new Date(record.endTime) : null,
        durationMs: record.durationMs ?? null,
        error: record.error ?? null,
        exitCode: record.exitCode ?? null,
        result: record.result ? JSON.stringify(record.result) : null,
        outputFiles: record.outputFiles ? JSON.stringify(record.outputFiles) : null,
      },
    });
  }

  async updateStatus(id: string, status: ExecutionStatus, fields: Partial<ExecutionRecord> = {}): Promise<void> {
    const updateData: any = { status };

    if (fields.endTime) {
      updateData.endTime = new Date(fields.endTime);
    }
    if (fields.durationMs !== undefined) {
      updateData.durationMs = fields.durationMs;
    }
    if (fields.error !== undefined) {
      updateData.error = fields.error;
    }
    if (fields.exitCode !== undefined) {
      updateData.exitCode = fields.exitCode;
    }
    if (fields.result !== undefined) {
      updateData.result = fields.result ? JSON.stringify(fields.result) : null;
    }
    if (fields.outputFiles !== undefined) {
      updateData.outputFiles = fields.outputFiles ? JSON.stringify(fields.outputFiles) : null;
    }

    try {
      await prisma.execution.update({
        where: { id },
        data: updateData,
      });
    } catch (err: any) {
      if (err.code === 'P2025') {
        throw new Error(`Execution '${id}' not found.`);
      }
      throw err;
    }
  }

  async saveResult(id: string, result: unknown, outputFiles?: Record<string, string>): Promise<void> {
    const updateData: any = {
      result: result ? JSON.stringify(result) : null,
    };
    if (outputFiles) {
      updateData.outputFiles = JSON.stringify(outputFiles);
    }

    try {
      await prisma.execution.update({
        where: { id },
        data: updateData,
      });
    } catch (err: any) {
      if (err.code === 'P2025') {
        throw new Error(`Execution '${id}' not found.`);
      }
      throw err;
    }
  }

  async getById(id: string): Promise<ExecutionRecord | undefined> {
    const row = await prisma.execution.findUnique({
      where: { id },
    });
    if (!row) return undefined;

    return {
      id: row.id,
      agentId: row.agentId,
      status: row.status as ExecutionStatus,
      startTime: row.startTime.toISOString(),
      endTime: row.endTime ? row.endTime.toISOString() : undefined,
      durationMs: row.durationMs ?? undefined,
      runDir: this.getRunDir(row.id),
      logPath: this.getLogPath(row.id),
      error: row.error ?? undefined,
      exitCode: row.exitCode ?? undefined,
      input: JSON.parse(row.input),
      result: row.result ? JSON.parse(row.result) : undefined,
      outputFiles: row.outputFiles ? JSON.parse(row.outputFiles) : undefined,
    };
  }

  async list(agentId?: string): Promise<ExecutionIndexEntry[]> {
    const rows = await prisma.execution.findMany({
      where: agentId ? { agentId } : {},
      select: {
        id: true,
        agentId: true,
        status: true,
        startTime: true,
        endTime: true,
        durationMs: true,
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    return rows.map((row) => ({
      id: row.id,
      agentId: row.agentId,
      status: row.status as ExecutionStatus,
      startTime: row.startTime.toISOString(),
      endTime: row.endTime ? row.endTime.toISOString() : undefined,
      durationMs: row.durationMs ?? undefined,
    }));
  }

  getRunDir(id: string): string {
    return path.join(EXEC_DIR, id);
  }

  getLogPath(id: string): string {
    return path.join(this.getRunDir(id), "logs.txt");
  }

  appendLog(id: string, line: string): void {
    const p = this.getLogPath(id);
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const entry = `${new Date().toISOString()} ${line}\n`;
    fs.appendFileSync(p, entry, "utf-8");

    const MAX_LOG_BYTES = 5 * 1024 * 1024;
    try {
      const stat = fs.statSync(p);
      if (stat.size > MAX_LOG_BYTES) {
        const content = fs.readFileSync(p, "utf-8");
        const trimmed = content.slice(content.length - MAX_LOG_BYTES);
        const firstNewline = trimmed.indexOf("\n");
        const clean = firstNewline > -1 ? trimmed.slice(firstNewline + 1) : trimmed;
        fs.writeFileSync(p, clean, "utf-8");
      }
    } catch {
      // Non-fatal
    }
  }

  async pruneOldExecutions(): Promise<void> {
    const MAX_EXECUTIONS = 50;
    const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const entries = await prisma.execution.findMany({
      select: {
        id: true,
        endTime: true,
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    const surviving = entries
      .filter((e) => {
        if (!e.endTime) return true;
        const age = now - e.endTime.getTime();
        return age < MAX_AGE_MS;
      })
      .slice(-MAX_EXECUTIONS);

    const survivingIds = new Set(surviving.map((e) => e.id));
    const toDelete = entries.filter((e) => !survivingIds.has(e.id));

    if (toDelete.length === 0) return;

    const deleteIds = toDelete.map((e) => e.id);
    await prisma.execution.deleteMany({
      where: {
        id: { in: deleteIds },
      },
    });

    for (const entry of toDelete) {
      const dir = this.getRunDir(entry.id);
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // already gone
      }
    }
  }
}
export { prisma };
