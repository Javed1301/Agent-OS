import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExecutionRecord, ExecutionIndexEntry, ExecutionStatus } from "../types/execution.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.resolve(__dirname, "../../database");
const EXEC_DIR = path.join(DB_DIR, "executions");
const LOG_DIR = path.join(DB_DIR, "logs");
const INDEX_PATH = path.join(EXEC_DIR, "index.json");

/** Maximum log file size in bytes (5 MB) */
const MAX_LOG_BYTES = 5 * 1024 * 1024;
/** Retention: maximum number of executions to keep */
const MAX_EXECUTIONS = 50;
/** Retention: maximum age in milliseconds (14 days) */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function ensureDirs(): void {
  fs.mkdirSync(EXEC_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// --------------------------------------------------------------------------
// Index — atomic read/write using write-temp-then-rename
// --------------------------------------------------------------------------

function readIndex(): ExecutionIndexEntry[] {
  if (!fs.existsSync(INDEX_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")) as ExecutionIndexEntry[];
  } catch {
    return [];
  }
}

function writeIndex(entries: ExecutionIndexEntry[]): void {
  const tmp = INDEX_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2), "utf-8");
  fs.renameSync(tmp, INDEX_PATH);
}

function addOrUpdateIndex(entry: ExecutionIndexEntry): void {
  const entries = readIndex();
  const idx = entries.findIndex((e) => e.id === entry.id);
  if (idx === -1) {
    entries.push(entry);
  } else {
    entries[idx] = entry;
  }
  writeIndex(entries);
}

// --------------------------------------------------------------------------
// Per-execution file helpers
// --------------------------------------------------------------------------

function execPath(id: string): string {
  return path.join(EXEC_DIR, `${id}.json`);
}

function logPath(id: string): string {
  return path.join(LOG_DIR, `${id}.log`);
}

function readExec(id: string): ExecutionRecord | undefined {
  const p = execPath(id);
  if (!fs.existsSync(p)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as ExecutionRecord;
  } catch {
    return undefined;
  }
}

function writeExec(record: ExecutionRecord): void {
  const tmp = execPath(record.id) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2), "utf-8");
  fs.renameSync(tmp, execPath(record.id));
}

// --------------------------------------------------------------------------
// Log helpers — enforce 5 MB cap by truncating oldest content
// --------------------------------------------------------------------------

function appendLog(id: string, line: string): void {
  const p = logPath(id);
  const entry = `${new Date().toISOString()} ${line}\n`;
  fs.appendFileSync(p, entry, "utf-8");

  // Cap at MAX_LOG_BYTES: if over limit, truncate the front
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
    // Non-fatal — log may have been deleted
  }
}

// --------------------------------------------------------------------------
// Retention cleanup
// --------------------------------------------------------------------------

function pruneOldExecutions(): void {
  const entries = readIndex();
  const now = Date.now();

  const surviving = entries
    .filter((e) => {
      if (!e.endTime) return true; // still running
      const age = now - new Date(e.endTime).getTime();
      return age < MAX_AGE_MS;
    })
    .slice(-MAX_EXECUTIONS);

  // Delete files for pruned entries
  const survivingIds = new Set(surviving.map((e) => e.id));
  for (const entry of entries) {
    if (!survivingIds.has(entry.id)) {
      try { fs.unlinkSync(execPath(entry.id)); } catch { /* already gone */ }
      try { fs.unlinkSync(logPath(entry.id)); } catch { /* already gone */ }
    }
  }

  writeIndex(surviving);
}

// --------------------------------------------------------------------------
// Public store interface
// --------------------------------------------------------------------------

export const storeService = {
  init(): void {
    ensureDirs();
    // Initialize empty index if missing
    if (!fs.existsSync(INDEX_PATH)) {
      writeIndex([]);
    }
  },

  createExecution(record: ExecutionRecord): void {
    ensureDirs();
    writeExec(record);
    addOrUpdateIndex({
      id: record.id,
      agentId: record.agentId,
      status: record.status,
      startTime: record.startTime,
    });
  },

  updateStatus(id: string, status: ExecutionStatus, fields: Partial<ExecutionRecord> = {}): void {
    const record = readExec(id);
    if (!record) throw new Error(`Execution '${id}' not found.`);
    const updated: ExecutionRecord = { ...record, ...fields, status };
    writeExec(updated);
    addOrUpdateIndex({
      id: updated.id,
      agentId: updated.agentId,
      status: updated.status,
      startTime: updated.startTime,
      endTime: updated.endTime,
      durationMs: updated.durationMs,
    });
  },

  saveResult(id: string, result: unknown, outputFiles?: Record<string, string>): void {
    const record = readExec(id);
    if (!record) throw new Error(`Execution '${id}' not found.`);
    const updated: ExecutionRecord = { ...record, result, outputFiles };
    writeExec(updated);
  },

  appendLog(id: string, line: string): void {
    appendLog(id, line);
  },

  getById(id: string): ExecutionRecord | undefined {
    return readExec(id);
  },

  list(agentId?: string): ExecutionIndexEntry[] {
    const entries = readIndex();
    if (agentId) return entries.filter((e) => e.agentId === agentId);
    return entries;
  },

  getLogPath(id: string): string {
    return logPath(id);
  },

  pruneOldExecutions,
};
