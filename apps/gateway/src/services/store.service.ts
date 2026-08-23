/**
 * Store Service — Flat-file persistence for executions and logs.
 *
 * Directory layout (relative to workspace root):
 *   data/
 *   ├── executions/
 *   │   ├── index.json          — lightweight index of all executions
 *   │   └── <id>/
 *   │       ├── input.json      — raw input payload
 *   │       ├── output.json     — full ExecutionRecord
 *   │       ├── logs.txt        — streaming log lines
 *   │       └── artifacts/      — agent output files moved here
 *   └── logs/                   — legacy; new executions use per-folder logs.txt
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExecutionRecord, ExecutionIndexEntry, ExecutionStatus } from "../types/execution.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Workspace root override for Docker or 4 levels up from apps/gateway/src/services/
const WORKSPACE_ROOT = process.env["WORKSPACE_ROOT"]
  ? path.resolve(process.env["WORKSPACE_ROOT"])
  : path.resolve(__dirname, "../../../..");
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(WORKSPACE_ROOT, "data");
const EXEC_DIR = path.join(DATA_DIR, "executions");
const INDEX_PATH = path.join(EXEC_DIR, "index.json");

/** Maximum log file size in bytes (5 MB) */
const MAX_LOG_BYTES = 5 * 1024 * 1024;
/** Retention: maximum number of executions to keep */
const MAX_EXECUTIONS = 50;
/** Retention: maximum age in milliseconds (14 days) */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function ensureDirs(): void {
  fs.mkdirSync(EXEC_DIR, { recursive: true });
}

// --------------------------------------------------------------------------
// Execution run directory helpers
// --------------------------------------------------------------------------

/** Returns the isolated run directory for an execution. */
function getRunDir(id: string): string {
  return path.join(EXEC_DIR, id);
}

/** Ensures the isolated run directory structure exists. */
function ensureRunDir(id: string): string {
  const dir = getRunDir(id);
  fs.mkdirSync(path.join(dir, "artifacts"), { recursive: true });
  return dir;
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
// Per-execution file helpers (now stored in data/executions/<id>/)
// --------------------------------------------------------------------------

function outputPath(id: string): string {
  return path.join(getRunDir(id), "output.json");
}

function logPath(id: string): string {
  return path.join(getRunDir(id), "logs.txt");
}

function inputPath(id: string): string {
  return path.join(getRunDir(id), "input.json");
}

function readExec(id: string): ExecutionRecord | undefined {
  const p = outputPath(id);
  if (!fs.existsSync(p)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as ExecutionRecord;
  } catch {
    return undefined;
  }
}

function writeExec(record: ExecutionRecord): void {
  const dir = getRunDir(record.id);
  if (!fs.existsSync(dir)) ensureRunDir(record.id);
  const tmp = outputPath(record.id) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2), "utf-8");
  fs.renameSync(tmp, outputPath(record.id));
}

// --------------------------------------------------------------------------
// Log helpers — enforce 5 MB cap by truncating oldest content
// --------------------------------------------------------------------------

function appendLogLine(id: string, line: string): void {
  const p = logPath(id);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const entry = `${new Date().toISOString()} ${line}\n`;
  fs.appendFileSync(p, entry, "utf-8");

  // Cap at MAX_LOG_BYTES
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

// --------------------------------------------------------------------------
// Retention cleanup
// --------------------------------------------------------------------------

function pruneOldExecutions(): void {
  const entries = readIndex();
  const now = Date.now();

  const surviving = entries
    .filter((e) => {
      if (!e.endTime) return true;
      const age = now - new Date(e.endTime).getTime();
      return age < MAX_AGE_MS;
    })
    .slice(-MAX_EXECUTIONS);

  const survivingIds = new Set(surviving.map((e) => e.id));
  for (const entry of entries) {
    if (!survivingIds.has(entry.id)) {
      const dir = getRunDir(entry.id);
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* already gone */ }
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
    if (!fs.existsSync(INDEX_PATH)) {
      writeIndex([]);
    }
    console.log(`[store] Persistence at: ${DATA_DIR}`);
  },

  /**
   * Create a new execution record.
   * Also writes input.json and creates the run directory structure.
   */
  createExecution(record: ExecutionRecord, input: Record<string, unknown>): void {
    ensureDirs();
    const dir = ensureRunDir(record.id);

    // Write input.json
    fs.writeFileSync(inputPath(record.id), JSON.stringify(input, null, 2), "utf-8");

    // Write initial output.json
    writeExec(record);

    addOrUpdateIndex({
      id: record.id,
      agentId: record.agentId,
      status: record.status,
      startTime: record.startTime,
    });

    console.log(`[store] Created execution ${record.id} at ${dir}`);
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
    appendLogLine(id, line);
  },

  getById(id: string): ExecutionRecord | undefined {
    return readExec(id);
  },

  list(agentId?: string): ExecutionIndexEntry[] {
    const entries = readIndex();
    if (agentId) return entries.filter((e) => e.agentId === agentId);
    return entries;
  },

  getRunDir(id: string): string {
    return getRunDir(id);
  },

  getLogPath(id: string): string {
    return logPath(id);
  },

  pruneOldExecutions,
};
