import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { logger } from "../src/services/logger.service.js";

test.describe("Structured Logger Service Unit Tests", () => {
  let logOutput: string[] = [];
  let warnOutput: string[] = [];
  let errorOutput: string[] = [];

  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  beforeEach(() => {
    logOutput = [];
    warnOutput = [];
    errorOutput = [];

    console.log = (msg: string) => {
      logOutput.push(String(msg));
    };
    console.warn = (msg: string) => {
      warnOutput.push(String(msg));
    };
    console.error = (msg: string) => {
      errorOutput.push(String(msg));
    };
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  });

  test("1. logger.info() emits valid JSON on console.log", () => {
    logger.info("test_event", "Test info message");
    assert.strictEqual(logOutput.length, 1);
    
    const parsed = JSON.parse(logOutput[0]);
    assert.strictEqual(typeof parsed, "object");
    assert.ok(parsed !== null);
  });

  test("2. Required fields exist: timestamp, level, event, message", () => {
    logger.info("test_event", "Test message");
    const parsed = JSON.parse(logOutput[0]);

    assert.ok(parsed.timestamp);
    assert.strictEqual(typeof parsed.timestamp, "string");
    assert.strictEqual(parsed.level, "INFO");
    assert.strictEqual(parsed.event, "test_event");
    assert.strictEqual(parsed.message, "Test message");
  });

  test("3. executionId is preserved in context", () => {
    logger.info("execution_started", "Execution running", {
      executionId: "exec_12345",
    });
    const parsed = JSON.parse(logOutput[0]);
    assert.strictEqual(parsed.executionId, "exec_12345");
  });

  test("4. agentId is preserved in context", () => {
    logger.info("execution_started", "Execution running", {
      agentId: "planner-agent",
    });
    const parsed = JSON.parse(logOutput[0]);
    assert.strictEqual(parsed.agentId, "planner-agent");
  });

  test("5. durationMs is preserved in context", () => {
    logger.info("environment_resolved", "Environment resolved", {
      durationMs: 142,
    });
    const parsed = JSON.parse(logOutput[0]);
    assert.strictEqual(parsed.durationMs, 142);
  });

  test("6. details are preserved when explicitly supplied", () => {
    logger.info("process_spawned", "Process spawned", {
      details: { pid: 9876, interpreterPath: "/usr/bin/python3" },
    });
    const parsed = JSON.parse(logOutput[0]);
    assert.deepStrictEqual(parsed.details, { pid: 9876, interpreterPath: "/usr/bin/python3" });
  });

  test("7. Logger does not automatically dump process.env", () => {
    logger.info("test_event", "Checking secrets safety", {
      executionId: "exec_safe",
    });
    const parsed = JSON.parse(logOutput[0]);
    assert.strictEqual(parsed.DATABASE_URL, undefined);
    assert.strictEqual(parsed.GEMINI_API_KEY, undefined);
    assert.strictEqual(parsed.PATH, undefined);
    assert.strictEqual(parsed.process, undefined);
    assert.strictEqual(parsed.env, undefined);
  });

  test("8. logger.warn() produces WARN level on console.warn", () => {
    logger.warn("execution_timed_out", "Execution timed out", {
      executionId: "exec_timeout_123",
    });
    assert.strictEqual(warnOutput.length, 1);
    const parsed = JSON.parse(warnOutput[0]);
    assert.strictEqual(parsed.level, "WARN");
    assert.strictEqual(parsed.event, "execution_timed_out");
  });

  test("9. logger.error() produces ERROR level on console.error", () => {
    logger.error("process_error", "Failed to spawn process", {
      executionId: "exec_err_123",
    });
    assert.strictEqual(errorOutput.length, 1);
    const parsed = JSON.parse(errorOutput[0]);
    assert.strictEqual(parsed.level, "ERROR");
    assert.strictEqual(parsed.event, "process_error");
  });
});
