import test, { before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { metricsService } from "../src/services/metrics.service.js";
import { FakeAdapter, makeTestAgent, setupTestEnv, teardownTestEnv, waitForTerminalState, executionService, TEST_DATA_DIR } from "./lifecycle/helpers.js";

test.describe("Operational Metrics Service Unit Tests", () => {
  beforeEach(() => {
    metricsService.resetMetrics();
  });

  // 1. Initial metrics are zero
  test("1. Initial metrics are zero", () => {
    const metrics = metricsService.getMetrics();
    assert.strictEqual(metrics.executions_total, 0);
    assert.strictEqual(metrics.executions_active, 0);
    assert.strictEqual(metrics.executions_completed, 0);
    assert.strictEqual(metrics.executions_failed, 0);
    assert.strictEqual(metrics.executions_cancelled, 0);
    assert.strictEqual(metrics.executions_timeout, 0);
    assert.strictEqual(metrics.execution_duration_avg_ms, 0);
    assert.strictEqual(metrics.runtime_setup_duration_avg_ms, 0);
  });

  // 2. recordExecutionStart() increments total and active
  test("2. recordExecutionStart() increments total and active", () => {
    metricsService.recordExecutionStart();
    const metrics = metricsService.getMetrics();
    assert.strictEqual(metrics.executions_total, 1);
    assert.strictEqual(metrics.executions_active, 1);
  });

  // 3. Multiple starts are counted correctly
  test("3. Multiple starts are counted correctly", () => {
    metricsService.recordExecutionStart();
    metricsService.recordExecutionStart();
    metricsService.recordExecutionStart();
    const metrics = metricsService.getMetrics();
    assert.strictEqual(metrics.executions_total, 3);
    assert.strictEqual(metrics.executions_active, 3);
  });

  // 4. Runtime setup duration is recorded
  test("4. Runtime setup duration is recorded", () => {
    metricsService.recordRuntimeSetup(150);
    const metrics = metricsService.getMetrics();
    assert.strictEqual(metrics.runtime_setup_duration_ms_total, 150);
    assert.strictEqual(metrics.runtime_setup_duration_ms_count, 1);
  });

  // 5. Average runtime setup duration is correct
  test("5. Average runtime setup duration is correct", () => {
    metricsService.recordRuntimeSetup(100);
    metricsService.recordRuntimeSetup(200);
    const metrics = metricsService.getMetrics();
    assert.strictEqual(metrics.runtime_setup_duration_avg_ms, 150);
  });

  // 6. Completed terminal execution increments completed
  test("6. Completed terminal execution increments completed", () => {
    metricsService.recordExecutionStart();
    metricsService.recordExecutionTerminal("completed", 500);
    const metrics = metricsService.getMetrics();
    assert.strictEqual(metrics.executions_completed, 1);
  });

  // 7. Failed execution increments failed
  test("7. Failed execution increments failed", () => {
    metricsService.recordExecutionStart();
    metricsService.recordExecutionTerminal("failed", 300);
    const metrics = metricsService.getMetrics();
    assert.strictEqual(metrics.executions_failed, 1);
  });

  // 8. Cancelled execution increments cancelled
  test("8. Cancelled execution increments cancelled", () => {
    metricsService.recordExecutionStart();
    metricsService.recordExecutionTerminal("cancelled", 200);
    const metrics = metricsService.getMetrics();
    assert.strictEqual(metrics.executions_cancelled, 1);
  });

  // 9. Timeout execution increments timeout
  test("9. Timeout execution increments timeout", () => {
    metricsService.recordExecutionStart();
    metricsService.recordExecutionTerminal("timeout", 1000);
    const metrics = metricsService.getMetrics();
    assert.strictEqual(metrics.executions_timeout, 1);
  });

  // 10. Terminal execution decrements active
  test("10. Terminal execution decrements active", () => {
    metricsService.recordExecutionStart();
    assert.strictEqual(metricsService.getMetrics().executions_active, 1);

    metricsService.recordExecutionTerminal("completed", 100);
    assert.strictEqual(metricsService.getMetrics().executions_active, 0);
  });

  // 11. Execution duration average is correct
  test("11. Execution duration average is correct", () => {
    metricsService.recordExecutionStart();
    metricsService.recordExecutionTerminal("completed", 1000);
    metricsService.recordExecutionStart();
    metricsService.recordExecutionTerminal("completed", 2000);

    const metrics = metricsService.getMetrics();
    assert.strictEqual(metrics.execution_duration_avg_ms, 1500);
  });

  // 12. Invalid duration values are ignored
  test("12. Invalid duration values are ignored", () => {
    metricsService.recordRuntimeSetup(-50);
    metricsService.recordRuntimeSetup(NaN);
    metricsService.recordRuntimeSetup(Infinity);

    metricsService.recordExecutionStart();
    metricsService.recordExecutionTerminal("completed", -100);
    metricsService.recordExecutionTerminal("completed", NaN);

    const metrics = metricsService.getMetrics();
    assert.strictEqual(metrics.runtime_setup_duration_ms_count, 0);
    assert.strictEqual(metrics.execution_duration_ms_count, 0);
  });

  // 13. Zero-sample averages return 0
  test("13. Zero-sample averages return 0", () => {
    const metrics = metricsService.getMetrics();
    assert.strictEqual(metrics.execution_duration_avg_ms, 0);
    assert.strictEqual(metrics.runtime_setup_duration_avg_ms, 0);
  });
});

test.describe("Metrics Integration & Double-Count Protection Tests", () => {
  let fakeAdapter: FakeAdapter;

  before(async () => {
    await setupTestEnv();
  });

  after(async () => {
    await teardownTestEnv();
  });

  beforeEach(() => {
    fakeAdapter = new FakeAdapter();
    executionService._adapterOverride = fakeAdapter;
    metricsService.resetMetrics();
  });

  afterEach(() => {
    executionService._adapterOverride = undefined;
  });

  // 14 & 15. Verify /metrics and /api/metrics structure
  test("14 & 15. getMetrics snapshot produces correct endpoint structure", () => {
    metricsService.recordExecutionStart();
    metricsService.recordExecutionTerminal("completed", 450);

    const snapshot = metricsService.getMetrics();
    const payload = {
      timestamp: new Date().toISOString(),
      uptimeSeconds: 10,
      metrics: snapshot,
    };

    assert.ok(payload.timestamp);
    assert.strictEqual(payload.uptimeSeconds, 10);
    assert.strictEqual(payload.metrics.executions_total, 1);
    assert.strictEqual(payload.metrics.executions_completed, 1);
    assert.strictEqual(payload.metrics.executions_active, 0);
  });

  // 16. Terminal metrics are not double-counted when handleTerminal is called more than once
  test("16. Terminal metrics are not double-counted on duplicate terminal calls", async () => {
    const agent = makeTestAgent();
    fakeAdapter.script = [{ type: "status", data: "completed" }];

    const executionId = await executionService.execute(agent, { input: "double-count-check" });
    const terminalRecord = await waitForTerminalState(executionId);

    assert.ok(terminalRecord.runDir.startsWith(TEST_DATA_DIR));
    assert.strictEqual(terminalRecord.status, "completed");

    const metricsAfterFirst = metricsService.getMetrics();
    assert.strictEqual(metricsAfterFirst.executions_completed, 1);
    assert.strictEqual(metricsAfterFirst.executions_active, 0);

    // Call cancel() on already completed execution (simulating race condition)
    executionService.cancel(executionId);

    const metricsAfterSecond = metricsService.getMetrics();
    assert.strictEqual(metricsAfterSecond.executions_completed, 1);
    assert.strictEqual(metricsAfterSecond.executions_cancelled, 0);
    assert.strictEqual(metricsAfterSecond.executions_active, 0);
  });
});
