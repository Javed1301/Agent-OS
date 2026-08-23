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
  makeExecution,
  setupTestEnv,
  teardownTestEnv,
  waitForExecutionStatus,
  waitForTerminalState,
  TEST_DATA_DIR,
} from "./helpers.js";
import { environmentResolver } from "../../src/services/environment-resolver.service.js";

test.describe("Execution Lifecycle Integration Tests", () => {
  let fakeAdapter: FakeAdapter;

  before(async () => {
    await setupTestEnv();
  });

  after(async () => {
    await teardownTestEnv();
  });

  beforeEach(async () => {
    fakeAdapter = new FakeAdapter();
    executionService._adapterOverride = fakeAdapter;
    await prisma.execution.deleteMany();
    await prisma.agent.deleteMany();
  });

  afterEach(() => {
    executionService._adapterOverride = undefined;
  });

  // ==========================================================================
  // PHASE 5 — QUEUED TEST
  // ==========================================================================
  test("queued state is persisted in DB immediately on execute()", async () => {
    // 1. Create agent that uses working directory lock
    const agent = makeTestAgent({
      id: "lock-test-agent",
      usesWdLock: true,
      workingDirectory: path.join(TEST_DATA_DIR, "lock-dir"),
    });

    // 2. Start the blocker execution (acquires the lock and stays running)
    const execId1 = await executionService.execute(agent, { input: "blocker" });
    
    // Wait until blocker transitions to running (meaning lock is acquired)
    await waitForExecutionStatus(execId1, "running");

    // 3. Start the second execution (will block in queued state waiting for the lock)
    const execId2 = await executionService.execute(agent, { input: "queued-test" });

    // Assert that the second execution is persisted as queued
    const record = await repo.getById(execId2);
    assert.ok(record, "Execution record should exist");
    assert.strictEqual(record.status, "queued");
    assert.strictEqual(record.agentId, agent.id);
    assert.ok(record.startTime);
    assert.strictEqual(record.endTime, undefined);

    // 4. Cleanup: cancel the blocker so the lock is released
    executionService.cancel(execId1);
    await waitForTerminalState(execId1);

    // The second execution can now proceed and finish/be cancelled
    await waitForExecutionStatus(execId2, "running");
    executionService.cancel(execId2);
    await waitForTerminalState(execId2);
  });

  // ==========================================================================
  // PHASE 6 — RUNNING TEST
  // ==========================================================================
  test("queued -> running transition is persisted correctly", async () => {
    const agent = makeTestAgent();
    
    // Stub adapter does nothing, keeping execution in 'running' state
    fakeAdapter.onExecute = () => {};

    const executionId = await executionService.execute(agent, { input: "test" });
    const record = await waitForExecutionStatus(executionId, "running");

    assert.strictEqual(record.status, "running");
    assert.ok(record.startTime);
    assert.strictEqual(record.endTime, undefined);
    assert.strictEqual(record.durationMs, undefined);
  });

  // ==========================================================================
  // PHASE 7 — COMPLETED TEST
  // ==========================================================================
  test("completed path persists status, endTime, durationMs, and result", async () => {
    const agent = makeTestAgent();
    const resultData = { answer: "success", score: 0.95 };

    fakeAdapter.script = [
      { type: "result", data: resultData },
      { type: "status", data: "completed" },
    ];

    const executionId = await executionService.execute(agent, { input: "test" });
    const record = await waitForTerminalState(executionId);

    // Verify DB state
    assert.strictEqual(record.status, "completed");
    assert.ok(record.endTime);
    assert.ok(record.durationMs !== undefined);
    assert.ok(record.durationMs >= 0);

    // Assert outputFiles are undefined (not supplied)
    assert.strictEqual(record.outputFiles, undefined);

    // Assert filesystem artifacts still exist
    const runDir = repo.getRunDir(executionId);
    assert.ok(fs.existsSync(path.join(runDir, "input.json")));
    assert.ok(fs.existsSync(path.join(runDir, "artifacts")));

    // BUG DETECTED VERIFICATION:
    // If the async result update raced or failed, result will be undefined.
    // We assert it is populated.
    assert.deepStrictEqual(record.result, resultData);
  });

  // ==========================================================================
  // PHASE 8 — FAILED TEST (Adapter-originated failure)
  // ==========================================================================
  test("adapter-originated failure persists failed status and error message", async () => {
    const agent = makeTestAgent();
    const errorMsg = "deterministic adapter failure";

    fakeAdapter.script = [
      { type: "error", data: errorMsg },
      { type: "status", data: "failed" },
    ];

    const executionId = await executionService.execute(agent, { input: "test" });
    const record = await waitForTerminalState(executionId);

    assert.strictEqual(record.status, "failed");
    assert.ok(record.endTime);
    assert.ok(record.durationMs !== undefined);

    // BUG DETECTED VERIFICATION:
    // Adapter-originated failure path does not pass error message to handleTerminal.
    // We assert the error message should be persisted.
    assert.strictEqual(record.error, errorMsg);
  });

  // ==========================================================================
  // PHASE 9 — EXPLICIT EXECUTION FAILURE
  // ==========================================================================
  test("explicit executionService startup/adapter failure persists failed status and error message", async () => {
    const agent = makeTestAgent();
    const errorMsg = "sync execute crash";

    // Force adapter execute to throw synchronously
    fakeAdapter.execute = () => {
      throw new Error(errorMsg);
    };

    const executionId = await executionService.execute(agent, { input: "test" });
    const record = await waitForTerminalState(executionId);

    assert.strictEqual(record.status, "failed");
    assert.ok(record.endTime);
    assert.ok(record.durationMs !== undefined);
    assert.strictEqual(record.error, errorMsg);
  });

  // ==========================================================================
  // PHASE 10 — QUEUED -> FAILED (Environment-resolution failure)
  // ==========================================================================
  test("queued -> running -> failed transition occurs on environment resolution failure", async () => {
    // To trigger environment resolution, agent type must be "python"
    const agent = makeTestAgent({ type: "python" });
    
    // Spying / Stubbing environmentResolver.resolve to throw
    const originalResolve = environmentResolver.resolve;
    environmentResolver.resolve = async () => {
      throw new Error("env resolver error");
    };

    try {
      const executionId = await executionService.execute(agent, { input: "test" });
      const record = await waitForTerminalState(executionId);

      assert.strictEqual(record.status, "failed");
      assert.ok(record.endTime);
      assert.strictEqual(record.error, "env resolver error");
    } finally {
      // Restore
      environmentResolver.resolve = originalResolve;
    }
  });

  // ==========================================================================
  // PHASE 11 — CANCELLATION TEST
  // ==========================================================================
  test("cancellation sets cancelled status and keeps run directory", async () => {
    const agent = makeTestAgent();
    let cancelCalled = false;

    fakeAdapter.onExecute = () => {};
    fakeAdapter.onCancel = () => {
      cancelCalled = true;
    };

    const executionId = await executionService.execute(agent, { input: "test" });
    await waitForExecutionStatus(executionId, "running");

    const cancelResult = executionService.cancel(executionId);
    assert.strictEqual(cancelResult, true, "cancel call should return true");
    assert.strictEqual(cancelCalled, true, "adapter onCancel should be called");

    const record = await waitForTerminalState(executionId);
    assert.strictEqual(record.status, "cancelled");
    assert.ok(record.endTime);
    assert.ok(record.durationMs !== undefined);

    // Verify filesystem remains
    const runDir = repo.getRunDir(executionId);
    assert.ok(fs.existsSync(path.join(runDir, "input.json")));
  });

  // ==========================================================================
  // PHASE 12 — CANCEL AFTER COMPLETION
  // ==========================================================================
  test("cancel call on completed execution returns false and preserves status", async () => {
    const agent = makeTestAgent();
    const resultData = { ok: true };

    fakeAdapter.script = [
      { type: "result", data: resultData },
      { type: "status", data: "completed" },
    ];

    const executionId = await executionService.execute(agent, { input: "test" });
    const completedRecord = await waitForTerminalState(executionId);
    assert.strictEqual(completedRecord.status, "completed");

    // Act
    const cancelResult = executionService.cancel(executionId);
    assert.strictEqual(cancelResult, false, "cancel call should return false");

    // Verify DB unchanged
    const finalRecord = await repo.getById(executionId);
    assert.strictEqual(finalRecord?.status, "completed");
    assert.strictEqual(finalRecord?.endTime, completedRecord.endTime);
    assert.deepStrictEqual(finalRecord?.result, resultData);
  });

  // ==========================================================================
  // PHASE 13 — INVALID TERMINAL TRANSITIONS
  // ==========================================================================
  test("direct status transition requests via repository do not have state-machine enforcement", async () => {
    const agent = makeTestAgent();
    fakeAdapter.script = [{ type: "status", data: "completed" }];

    const executionId = await executionService.execute(agent, { input: "test" });
    await waitForTerminalState(executionId);

    // The repo doesn't enforce executionService state machine, it accepts updates.
    await repo.updateStatus(executionId, "cancelled");
    const record = await repo.getById(executionId);
    assert.strictEqual(record?.status, "cancelled");
  });

  // ==========================================================================
  // PHASE 14 — CANCELLATION / COMPLETION RACE
  // ==========================================================================
  test("Scenario A: completion happens first, then cancellation", async () => {
    const agent = makeTestAgent();
    
    // 1. Adapter execute runs, emits completion immediately
    fakeAdapter.script = [{ type: "status", data: "completed" }];

    const executionId = await executionService.execute(agent, { input: "test" });
    await waitForTerminalState(executionId);

    // 2. Cancellation request arrives after
    const cancelled = executionService.cancel(executionId);
    assert.strictEqual(cancelled, false);

    const record = await repo.getById(executionId);
    assert.strictEqual(record?.status, "completed");
  });

  test("Scenario B: cancellation happens first, then completion event arrives", async () => {
    const agent = makeTestAgent();
    let ctxRef: any;

    fakeAdapter.onExecute = (ctx) => {
      ctxRef = ctx;
    };

    const executionId = await executionService.execute(agent, { input: "test" });
    await waitForExecutionStatus(executionId, "running");

    // 1. Cancel first
    const cancelled = executionService.cancel(executionId);
    assert.strictEqual(cancelled, true);

    const recordAfterCancel = await waitForTerminalState(executionId);
    assert.strictEqual(recordAfterCancel.status, "cancelled");

    // 2. Completion event attempts to arrive later
    ctxRef.sseRes.write(`data: ${JSON.stringify({ type: "status", data: "completed", executionId })}\n\n`);

    // Let any async tasks process
    await new Promise((res) => setTimeout(res, 50));

    // Verify it is STILL cancelled
    const finalRecord = await repo.getById(executionId);
    assert.strictEqual(finalRecord?.status, "cancelled");
  });

  // ==========================================================================
  // PHASE 16 — EXIT CODE & TIMEOUT
  // ==========================================================================
  test("exitCode remains undefined and timeout status is never set", async () => {
    const agent = makeTestAgent();
    fakeAdapter.script = [{ type: "status", data: "completed" }];

    const executionId = await executionService.execute(agent, { input: "test" });
    const record = await waitForTerminalState(executionId);

    assert.strictEqual(record.exitCode, undefined);
    assert.ok(record.status !== "timeout");
  });
});
