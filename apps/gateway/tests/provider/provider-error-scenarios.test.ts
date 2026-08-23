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
  waitForTerminalState,
} from "../lifecycle/helpers.js";
import { pythonAdapter } from "../../src/adapters/python.js";
import { restAdapter } from "../../src/adapters/rest.js";

test.describe("Deterministic Provider Testing and Error Scenarios", () => {
  let fakeAdapter: FakeAdapter;
  let originalPythonExecute: any;
  let originalRestExecute: any;
  let pythonAdapterCalled = false;
  let restAdapterCalled = false;

  before(async () => {
    await setupTestEnv();

    // Setup structural spies to guarantee no network / subprocess calls
    originalPythonExecute = pythonAdapter.execute;
    originalRestExecute = restAdapter.execute;

    pythonAdapter.execute = (ctx) => {
      pythonAdapterCalled = true;
      return originalPythonExecute(ctx);
    };

    restAdapter.execute = (ctx) => {
      restAdapterCalled = true;
      return originalRestExecute(ctx);
    };
  });

  after(async () => {
    // Restore original methods
    pythonAdapter.execute = originalPythonExecute;
    restAdapter.execute = originalRestExecute;

    await teardownTestEnv();
  });

  beforeEach(async () => {
    fakeAdapter = new FakeAdapter();
    executionService._adapterOverride = fakeAdapter;
    pythonAdapterCalled = false;
    restAdapterCalled = false;

    await prisma.execution.deleteMany();
    await prisma.agent.deleteMany();
  });

  afterEach(() => {
    executionService._adapterOverride = undefined;
  });

  // ==========================================================================
  // PHASE 2 — PROVIDER SUCCESS SCENARIO
  // ==========================================================================
  test("Scenario 1: Provider Success Scenario", async () => {
    fakeAdapter.script = [
      { type: "status", data: "started" },
      {
        type: "result",
        data: {
          answer: "No hate speech detected.",
          text: "Test input",
        },
      },
      { type: "status", data: "completed" },
    ];

    const agent = makeTestAgent();
    const executionId = await executionService.execute(agent, { input: "Test input" });
    const record = await waitForTerminalState(executionId);

    // Assert database state
    assert.strictEqual(record.status, "completed");
    assert.deepStrictEqual(record.result, {
      answer: "No hate speech detected.",
      text: "Test input",
    });
    assert.ok(record.endTime);
    assert.ok(record.durationMs !== undefined && record.durationMs >= 0);

    // Verify run directory and input.json
    const runDir = repo.getRunDir(executionId);
    assert.ok(fs.existsSync(runDir), "Run directory should exist");
    assert.ok(fs.existsSync(path.join(runDir, "input.json")), "input.json should exist");

    // Structural no-network verification
    assert.strictEqual(pythonAdapterCalled, false, "pythonAdapter should not be called");
    assert.strictEqual(restAdapterCalled, false, "restAdapter should not be called");
  });

  // ==========================================================================
  // PHASE 3 — PROVIDER AUTHENTICATION FAILURE
  // ==========================================================================
  test("Scenario 2: Provider Authentication Failure", async () => {
    fakeAdapter.script = [
      { type: "status", data: "started" },
      { type: "error", data: "AuthenticationError: No API key provided" },
      { type: "status", data: "failed" },
    ];

    const agent = makeTestAgent();
    const executionId = await executionService.execute(agent, { input: "Test input" });
    const record = await waitForTerminalState(executionId);

    assert.strictEqual(record.status, "failed");
    assert.strictEqual(record.error, "AuthenticationError: No API key provided");
    assert.ok(record.endTime);
    assert.ok(record.durationMs !== undefined && record.durationMs >= 0);

    // Structural no-network verification
    assert.strictEqual(pythonAdapterCalled, false, "pythonAdapter should not be called");
    assert.strictEqual(restAdapterCalled, false, "restAdapter should not be called");
  });

  // ==========================================================================
  // PHASE 4 — RATE LIMIT FAILURE
  // ==========================================================================
  test("Scenario 3: Rate Limit Failure", async () => {
    fakeAdapter.script = [
      { type: "status", data: "started" },
      { type: "error", data: "RateLimitError: 429 Too Many Requests" },
      { type: "status", data: "failed" },
    ];

    const agent = makeTestAgent();
    const executionId = await executionService.execute(agent, { input: "Test input" });
    const record = await waitForTerminalState(executionId);

    assert.strictEqual(record.status, "failed");
    assert.strictEqual(record.error, "RateLimitError: 429 Too Many Requests");
    assert.ok(record.endTime);
    assert.ok(record.durationMs !== undefined && record.durationMs >= 0);

    // Structural no-network verification
    assert.strictEqual(pythonAdapterCalled, false, "pythonAdapter should not be called");
    assert.strictEqual(restAdapterCalled, false, "restAdapter should not be called");
  });

  // ==========================================================================
  // PHASE 5 — MALFORMED / INCOMPLETE PROVIDER OUTPUT
  // ==========================================================================
  test("Scenario 4: Malformed / Incomplete Provider Output (Adapter Closes Early)", async () => {
    // Clear out standard script and simulate immediate close on execute
    fakeAdapter.script = [];
    fakeAdapter.onExecute = (ctx) => {
      // Simulate normal startup log
      ctx.sseRes.write(
        `data: ${JSON.stringify({
          type: "status",
          data: "started",
          executionId: ctx.execution.id,
          timestamp: new Date().toISOString(),
        })}\n\n`
      );
      // Close the stream early without writing completed or failed status
      ctx.sseRes.end();
    };

    const agent = makeTestAgent();
    const executionId = await executionService.execute(agent, { input: "Test input" });
    const record = await waitForTerminalState(executionId);

    assert.strictEqual(record.status, "failed");
    assert.strictEqual(record.error, "Adapter closed without status event.");
    assert.ok(record.endTime);
    assert.ok(record.durationMs !== undefined && record.durationMs >= 0);

    // Structural no-network verification
    assert.strictEqual(pythonAdapterCalled, false, "pythonAdapter should not be called");
    assert.strictEqual(restAdapterCalled, false, "restAdapter should not be called");
  });

  // ==========================================================================
  // PHASE 6 — SYNCHRONOUS ADAPTER FAILURE
  // ==========================================================================
  test("Scenario 5: Synchronous Adapter Failure", async () => {
    // Override execute method to throw synchronously
    fakeAdapter.execute = () => {
      throw new Error("deterministic adapter crash");
    };

    const agent = makeTestAgent();
    const executionId = await executionService.execute(agent, { input: "Test input" });
    const record = await waitForTerminalState(executionId);

    assert.strictEqual(record.status, "failed");
    assert.strictEqual(record.error, "deterministic adapter crash");
    assert.ok(record.endTime);
    assert.ok(record.durationMs !== undefined && record.durationMs >= 0);

    // Structural no-network verification
    assert.strictEqual(pythonAdapterCalled, false, "pythonAdapter should not be called");
    assert.strictEqual(restAdapterCalled, false, "restAdapter should not be called");
  });

  // ==========================================================================
  // PHASE 7 — STREAMING EVENT SEQUENCE
  // ==========================================================================
  test("Scenario 6: Streaming Event Sequence", async () => {
    fakeAdapter.script = [
      { type: "status", data: "started" },
      { type: "log", data: "Step 1 complete" },
      { type: "log", data: "Step 2 complete" },
      { type: "result", data: { answer: "final result" } },
      { type: "status", data: "completed" },
    ];

    const eventsReceived: any[] = [];
    fakeAdapter.onExecute = (ctx) => {
      const originalWrite = ctx.sseRes.write.bind(ctx.sseRes);
      ctx.sseRes.write = (chunk: string): boolean => {
        if (chunk.startsWith("data: ")) {
          try {
            const parsed = JSON.parse(chunk.slice(6).trim());
            eventsReceived.push(parsed);
          } catch {}
        }
        return originalWrite(chunk);
      };
    };

    const agent = makeTestAgent();
    const executionId = await executionService.execute(agent, { input: "Test input" });
    const record = await waitForTerminalState(executionId);

    assert.strictEqual(record.status, "completed");
    assert.deepStrictEqual(record.result, { answer: "final result" });
    assert.ok(record.endTime);
    assert.ok(record.durationMs !== undefined && record.durationMs >= 0);

    // Verify events are received in correct order
    const types = eventsReceived.map((e) => e.type);
    assert.deepStrictEqual(types, ["status", "log", "log", "result", "status"]);
    assert.strictEqual(eventsReceived[1].data, "Step 1 complete");
    assert.strictEqual(eventsReceived[2].data, "Step 2 complete");

    // Structural no-network verification
    assert.strictEqual(pythonAdapterCalled, false, "pythonAdapter should not be called");
    assert.strictEqual(restAdapterCalled, false, "restAdapter should not be called");
  });
});
