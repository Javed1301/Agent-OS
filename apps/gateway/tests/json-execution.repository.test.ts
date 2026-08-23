import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");
const TEST_DATA_DIR = path.join(WORKSPACE_ROOT, "data", "test-json");

// 1. Configure isolated test environment variables BEFORE importing repository
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.PERSISTENCE = "json";

import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const { JsonExecutionRepository } = await import("../src/repositories/json-execution.repository.js");

// Fixture factory for execution records
function makeExecution(overrides: Partial<any> = {}) {
  const uniqueId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  return {
    id: uniqueId,
    agentId: "hate-speech-detector",
    status: "queued",
    startTime: new Date().toISOString(),
    runDir: "", // derived at runtime
    logPath: "", // derived at runtime
    input: { text: "Hello Test Input" },
    ...overrides,
  };
}

let repo: JsonExecutionRepository;

before(() => {
  // Recreate isolated test directory structure
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

  repo = new JsonExecutionRepository();
  repo.init();
});

beforeEach(() => {
  // Reset executions filesystem between tests
  const execDir = path.join(TEST_DATA_DIR, "executions");
  if (fs.existsSync(execDir)) {
    fs.rmSync(execDir, { recursive: true, force: true });
  }
  fs.mkdirSync(execDir, { recursive: true });
  
  // Re-write empty index.json
  fs.writeFileSync(path.join(execDir, "index.json"), "[]", "utf-8");
});

after(() => {
  // Clean up entire test-json directory
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
});

// 1. CRUD: create and getById
test("creates and retrieves an execution from JSON storage", async () => {
  const record = makeExecution();
  await repo.create(record, record.input);

  const fetched = await repo.getById(record.id);
  assert.ok(fetched);
  assert.strictEqual(fetched.id, record.id);
  assert.strictEqual(fetched.agentId, record.agentId);
  assert.strictEqual(fetched.status, record.status);
  assert.deepStrictEqual(fetched.input, record.input);

  // Verify filesystem side effects
  const runDir = repo.getRunDir(record.id);
  assert.ok(fs.existsSync(path.join(runDir, "input.json")));
  assert.ok(fs.existsSync(path.join(runDir, "output.json")));
  assert.ok(fs.existsSync(path.join(runDir, "artifacts")));
  
  const writtenInput = JSON.parse(fs.readFileSync(path.join(runDir, "input.json"), "utf-8"));
  assert.deepStrictEqual(writtenInput, record.input);
});

test("returns undefined for an unknown execution ID", async () => {
  const result = await repo.getById("non-existent-id");
  assert.strictEqual(result, undefined);
});

// 2. CRUD: updateStatus
test("updates execution status and persists optional fields", async () => {
  const record = makeExecution();
  await repo.create(record, record.input);

  const endTime = new Date().toISOString();
  const durationMs = 850;
  const error = "Timeout exceeded";
  const exitCode = -1;
  const result = { success: false };
  const outputFiles = { "debug.log": "/path/to/debug.log" };

  await repo.updateStatus(record.id, "timeout", {
    endTime,
    durationMs,
    error,
    exitCode,
    result,
    outputFiles,
  });

  const updated = await repo.getById(record.id);
  assert.ok(updated);
  assert.strictEqual(updated.status, "timeout");
  assert.strictEqual(updated.endTime, endTime);
  assert.strictEqual(updated.durationMs, durationMs);
  assert.strictEqual(updated.error, error);
  assert.strictEqual(updated.exitCode, exitCode);
  assert.deepStrictEqual(updated.result, result);
  assert.deepStrictEqual(updated.outputFiles, outputFiles);
});

test("updateStatus throws error for unknown ID", async () => {
  await assert.rejects(async () => {
    await repo.updateStatus("unknown-id", "completed");
  }, /Execution 'unknown-id' not found./);
});

// 3. CRUD: saveResult
test("saves result and output files to JSON", async () => {
  const record = makeExecution();
  await repo.create(record, record.input);

  const result = { processed: true };
  const outputFiles = { "output.csv": "/path/to/output.csv" };

  await repo.saveResult(record.id, result, outputFiles);

  const updated = await repo.getById(record.id);
  assert.ok(updated);
  assert.deepStrictEqual(updated.result, result);
  assert.deepStrictEqual(updated.outputFiles, outputFiles);
});

test("saveResult throws error for unknown ID", async () => {
  await assert.rejects(async () => {
    await repo.saveResult("unknown-id", { data: "test" });
  }, /Execution 'unknown-id' not found./);
});

// 4. CRUD: list
test("lists all executions and supports agent ID filtering", async () => {
  const r1 = makeExecution({ id: "ex-1", agentId: "agent-a" });
  const r2 = makeExecution({ id: "ex-2", agentId: "agent-b" });
  const r3 = makeExecution({ id: "ex-3", agentId: "agent-a" });

  await repo.create(r1, r1.input);
  await repo.create(r2, r2.input);
  await repo.create(r3, r3.input);

  const all = await repo.list();
  assert.strictEqual(all.length, 3);
  assert.strictEqual(all[0].id, "ex-1");
  assert.strictEqual(all[1].id, "ex-2");
  assert.strictEqual(all[2].id, "ex-3");

  const filtered = await repo.list("agent-a");
  assert.strictEqual(filtered.length, 2);
  assert.ok(filtered.some(e => e.id === "ex-1"));
  assert.ok(filtered.some(e => e.id === "ex-3"));

  const empty = await repo.list("non-existent");
  assert.deepStrictEqual(empty, []);
});

test("returns empty array for list when empty", async () => {
  const all = await repo.list();
  assert.deepStrictEqual(all, []);
});

// 5. Path helpers
test("resolves deterministic runDir and logPath under test directory", () => {
  const runDir = repo.getRunDir("test-ex");
  assert.strictEqual(runDir, path.join(TEST_DATA_DIR, "executions", "test-ex"));

  const logPath = repo.getLogPath("test-ex");
  assert.strictEqual(logPath, path.join(TEST_DATA_DIR, "executions", "test-ex", "logs.txt"));
});

// 6. appendLog
test("creates and appends log lines with timestamps", () => {
  const execId = "ex-log-test";
  repo.appendLog(execId, "Step 1 complete");
  repo.appendLog(execId, "Step 2 complete");

  const logPath = repo.getLogPath(execId);
  assert.ok(fs.existsSync(logPath));

  const content = fs.readFileSync(logPath, "utf-8");
  assert.ok(content.includes("Step 1 complete"));
  assert.ok(content.includes("Step 2 complete"));
  assert.strictEqual(content.split("\n").filter(Boolean).length, 2);
});

// 7. Pruning & Retention
test("pruneOldExecutions executes without error on empty index", async () => {
  await assert.doesNotReject(async () => {
    await repo.pruneOldExecutions();
  });
});

test("pruneOldExecutions preserves executions within retention count and age limits", async () => {
  for (let i = 0; i < 40; i++) {
    const record = makeExecution({ id: `ex-prune-${i}` });
    await repo.create(record, record.input);
    await repo.updateStatus(record.id, "completed", { endTime: new Date().toISOString() });
  }

  await repo.pruneOldExecutions();

  const all = await repo.list();
  assert.strictEqual(all.length, 40);
});

test("pruneOldExecutions prunes oldest records when exceeding count limit of 50", async () => {
  for (let i = 0; i < 55; i++) {
    const record = makeExecution({ id: `ex-limit-${i}` });
    await repo.create(record, record.input);
    await repo.updateStatus(record.id, "completed", { endTime: new Date().toISOString() });
  }

  await repo.pruneOldExecutions();

  const all = await repo.list();
  assert.strictEqual(all.length, 50);

  // Check that the first 5 are pruned
  for (let i = 0; i < 5; i++) {
    const fetched = await repo.getById(`ex-limit-${i}`);
    assert.strictEqual(fetched, undefined);
    assert.strictEqual(fs.existsSync(repo.getRunDir(`ex-limit-${i}`)), false);
  }
  // Remaining 50 survive
  for (let i = 5; i < 55; i++) {
    const fetched = await repo.getById(`ex-limit-${i}`);
    assert.ok(fetched);
  }
});

test("pruneOldExecutions prunes records older than 14 days", async () => {
  const record = makeExecution({ id: "ex-old" });
  await repo.create(record, record.input);
  
  // Set endTime 15 days in the past
  const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
  await repo.updateStatus(record.id, "completed", { endTime: fifteenDaysAgo });

  await repo.pruneOldExecutions();

  const fetched = await repo.getById("ex-old");
  assert.strictEqual(fetched, undefined);
  assert.strictEqual(fs.existsSync(repo.getRunDir("ex-old")), false);
});

test("pruneOldExecutions preserves active records regardless of age or count", async () => {
  // Create 5 active records (no endTime) older than 14 days
  const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
  for (let i = 0; i < 5; i++) {
    const record = makeExecution({ id: `ex-active-old-${i}`, startTime: twentyDaysAgo });
    await repo.create(record, record.input);
  }

  await repo.pruneOldExecutions();

  for (let i = 0; i < 5; i++) {
    const fetched = await repo.getById(`ex-active-old-${i}`);
    assert.ok(fetched);
  }
});

// 8. Corrupted Data
test("skips or recovers safely from a corrupted index.json file", async () => {
  // Write deliberately malformed JSON to index.json
  const execDir = path.join(TEST_DATA_DIR, "executions");
  fs.writeFileSync(path.join(execDir, "index.json"), "invalid json data {", "utf-8");

  const list = await repo.list();
  assert.deepStrictEqual(list, []); // fallback returns empty array
});

test("returns undefined when output.json file is corrupted", async () => {
  const record = makeExecution();
  await repo.create(record, record.input);

  const runDir = repo.getRunDir(record.id);
  // Corrupt output.json
  fs.writeFileSync(path.join(runDir, "output.json"), "malformed {", "utf-8");

  const fetched = await repo.getById(record.id);
  assert.strictEqual(fetched, undefined); // fallback returns undefined
});

// 9. Missing files
test("returns undefined if output.json is missing on getById", async () => {
  const record = makeExecution();
  await repo.create(record, record.input);

  const runDir = repo.getRunDir(record.id);
  fs.rmSync(path.join(runDir, "output.json"));

  const fetched = await repo.getById(record.id);
  assert.strictEqual(fetched, undefined);
});
