import test, { before, beforeEach, after, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  prisma,
  executionService,
  repo,
  FakeAdapter,
  makeTestAgent,
  setupTestEnv,
  teardownTestEnv,
  waitForExecutionStatus,
  waitForTerminalState,
  cleanTables,
  TEST_DATA_DIR,
} from "./lifecycle/helpers.js";
import { getExecutionTimeoutMs } from "../src/services/execution.service.js";

test.describe("Execution Timeout & Watchdog Tests", () => {
  let fakeAdapter: FakeAdapter;
  const originalEnvTimeout = process.env.EXECUTION_TIMEOUT_MS;

  before(async () => {
    await setupTestEnv();
  });

  after(async () => {
    if (originalEnvTimeout !== undefined) {
      process.env.EXECUTION_TIMEOUT_MS = originalEnvTimeout;
    } else {
      delete process.env.EXECUTION_TIMEOUT_MS;
    }
    await teardownTestEnv();
  });

  beforeEach(async () => {
    fakeAdapter = new FakeAdapter();
    executionService._adapterOverride = fakeAdapter;
    await cleanTables();
  });

  afterEach(async () => {
    executionService._adapterOverride = undefined;
    if (originalEnvTimeout !== undefined) {
      process.env.EXECUTION_TIMEOUT_MS = originalEnvTimeout;
    } else {
      delete process.env.EXECUTION_TIMEOUT_MS;
    }
    await new Promise((res) => setTimeout(res, 50));
  });

  // ==========================================================================
  // 1. Fast execution: completes before timeout
  // ==========================================================================
  test("1. Fast execution completes before timeout without triggering watchdog", async () => {
    process.env.EXECUTION_TIMEOUT_MS = "5000";
    const agent = makeTestAgent();
    const resultData = { answer: "fast success" };

    fakeAdapter.script = [
      { type: "result", data: resultData },
      { type: "status", data: "completed" },
    ];

    const executionId = await executionService.execute(agent, { text: "fast payload" });
    const record = await waitForTerminalState(executionId);

    assert.strictEqual(record.status, "completed");
    assert.strictEqual(record.error, undefined);
  });

  // ==========================================================================
  // 2. Timeout: hanging execution exceeds timeout
  // ==========================================================================
  test("2. Hanging execution exceeds watchdog timeout and triggers cancellation", async () => {
    process.env.EXECUTION_TIMEOUT_MS = "100";
    const agent = makeTestAgent();
    let cancelCalled = false;

    // Hanging adapter does nothing
    fakeAdapter.onExecute = () => {};
    fakeAdapter.onCancel = () => {
      cancelCalled = true;
    };

    const executionId = await executionService.execute(agent, { text: "hanging payload" });
    const record = await waitForTerminalState(executionId, 2000);

    assert.strictEqual(record.status, "timeout");
    assert.strictEqual(cancelCalled, true, "Adapter cancel should be invoked on timeout");
    assert.ok(record.error?.includes("Execution timed out exceeding max duration"));
  });

  // ==========================================================================
  // 3. Lock cleanup: timed-out execution releases working-directory lock
  // ==========================================================================
  test("3. Timed-out execution releases working-directory lock allowing subsequent execution", async () => {
    process.env.EXECUTION_TIMEOUT_MS = "100";
    const agent = makeTestAgent({
      id: "timeout-lock-agent",
      usesWdLock: true,
      workingDirectory: path.join(TEST_DATA_DIR, "timeout-lock-dir"),
    });

    fakeAdapter.onExecute = () => {};

    // First execution hangs and times out
    const execId1 = await executionService.execute(agent, { text: "hanging-1" });
    const record1 = await waitForTerminalState(execId1, 2000);
    assert.strictEqual(record1.status, "timeout");

    // Second execution should acquire lock cleanly and proceed
    fakeAdapter.script = [{ type: "status", data: "completed" }];
    const execId2 = await executionService.execute(agent, { text: "fast-2" });
    const record2 = await waitForTerminalState(execId2, 2000);
    assert.strictEqual(record2.status, "completed");
  });

  // ==========================================================================
  // 4. Active execution cleanup
  // ==========================================================================
  test("4. Timed-out execution is evicted from activeExecutions map", async () => {
    process.env.EXECUTION_TIMEOUT_MS = "100";
    const agent = makeTestAgent();
    fakeAdapter.onExecute = () => {};

    const executionId = await executionService.execute(agent, { text: "test-active-map" });
    await waitForTerminalState(executionId, 2000);

    // Stream execution should serve stored record because it is evicted from active map
    const resMock = {
      setHeader: () => {},
      flushHeaders: () => {},
      write: () => true,
      end: () => {},
      writableEnded: false,
    };
    const found = await executionService.streamExecution(executionId, resMock as any);
    assert.strictEqual(found, true);
  });

  // ==========================================================================
  // 5. Persistence verification
  // ==========================================================================
  test("5. Timed-out execution persists status, duration, error message, and retains run directory", async () => {
    process.env.EXECUTION_TIMEOUT_MS = "100";
    const agent = makeTestAgent();
    fakeAdapter.onExecute = () => {};

    const executionId = await executionService.execute(agent, { text: "persist-test" });
    const record = await waitForTerminalState(executionId, 2000);

    assert.strictEqual(record.status, "timeout");
    assert.ok(record.endTime);
    assert.ok(record.durationMs !== undefined && record.durationMs >= 90);
    assert.ok(record.error?.includes("Execution timed out"));

    // Verify run directory and input.json are retained
    const runDir = repo.getRunDir(executionId);
    assert.ok(fs.existsSync(path.join(runDir, "input.json")));
    assert.ok(fs.existsSync(path.join(runDir, "logs.txt")));
  });

  // ==========================================================================
  // 6. Manual cancellation before timeout clears watchdog
  // ==========================================================================
  test("6. Manual cancel() before timeout clears watchdog and results only in cancelled status", async () => {
    process.env.EXECUTION_TIMEOUT_MS = "500";
    const agent = makeTestAgent();
    fakeAdapter.onExecute = () => {};

    const executionId = await executionService.execute(agent, { text: "cancel-test" });
    await waitForExecutionStatus(executionId, "running");

    // Cancel manually after 50ms (well before 500ms timeout)
    await new Promise((res) => setTimeout(res, 50));
    const cancelled = executionService.cancel(executionId);
    assert.strictEqual(cancelled, true);

    const record = await waitForTerminalState(executionId, 2000);
    assert.strictEqual(record.status, "cancelled");

    // Wait past the 500ms timeout to verify watchdog timer does not fire or overwrite status
    await new Promise((res) => setTimeout(res, 550));
    const finalRecord = await repo.getById(executionId);
    assert.strictEqual(finalRecord?.status, "cancelled");
  });

  // ==========================================================================
  // 7. Race condition protection
  // ==========================================================================
  test("7. Completion near timeout boundary produces exactly one terminal state", async () => {
    process.env.EXECUTION_TIMEOUT_MS = "100";
    const agent = makeTestAgent();

    // Adapter emits completion after 95ms (right at timeout boundary)
    fakeAdapter.onExecute = (ctx) => {
      setTimeout(() => {
        if (!ctx.sseRes.writableEnded) {
          ctx.sseRes.write(
            `data: ${JSON.stringify({ type: "status", data: "completed", executionId: ctx.execution.id })}\n\n`
          );
        }
      }, 95);
    };

    const executionId = await executionService.execute(agent, { text: "race-test" });
    const record = await waitForTerminalState(executionId, 2000);

    // Should be either completed or timeout, but strictly terminal
    assert.ok(record.status === "completed" || record.status === "timeout");
    assert.ok(record.endTime);
  });

  // ==========================================================================
  // 8. Configuration parsing: valid EXECUTION_TIMEOUT_MS
  // ==========================================================================
  test("8. getExecutionTimeoutMs respects valid positive integer env var", () => {
    process.env.EXECUTION_TIMEOUT_MS = "45000";
    assert.strictEqual(getExecutionTimeoutMs(), 45000);
  });

  // ==========================================================================
  // 9. Configuration parsing: invalid / malformed values fall back to 300000
  // ==========================================================================
  test("9. getExecutionTimeoutMs falls back to 300000 for invalid/malformed env values", () => {
    delete process.env.EXECUTION_TIMEOUT_MS;
    assert.strictEqual(getExecutionTimeoutMs(), 300000);

    process.env.EXECUTION_TIMEOUT_MS = "invalid-number";
    assert.strictEqual(getExecutionTimeoutMs(), 300000);

    process.env.EXECUTION_TIMEOUT_MS = "-5000";
    assert.strictEqual(getExecutionTimeoutMs(), 300000);

    process.env.EXECUTION_TIMEOUT_MS = "0";
    assert.strictEqual(getExecutionTimeoutMs(), 300000);

    process.env.EXECUTION_TIMEOUT_MS = "Infinity";
    assert.strictEqual(getExecutionTimeoutMs(), 300000);
  });
});
