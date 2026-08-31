import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../../../..");
const TEST_DATA_DIR = path.join(WORKSPACE_ROOT, "data", "test");
const TEST_DB_PATH = path.join(TEST_DATA_DIR, "agent-os.test.db");

// 1. Configure isolated test environment variables BEFORE importing production files
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;
process.env.TEST_ENV = "true";
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.PERSISTENCE = "sqlite";

import fs from "node:fs";
import { execSync } from "node:child_process";
import type { AgentDefinition } from "../../src/types/agent.js";
import type { ExecutionRecord, ExecutionStatus } from "../../src/types/execution.js";
import type { AgentAdapter, AdapterContext, AdapterHandle } from "../../src/adapters/base.js";

// Dynamically import production dependencies to capture environment variables
const { PrismaExecutionRepository, prisma } = await import("../../src/repositories/prisma-execution.repository.js");
const { executionService } = await import("../../src/services/execution.service.js");

export { prisma, executionService, TEST_DATA_DIR };

export const repo = new PrismaExecutionRepository();

export class FakeAdapter implements AgentAdapter {
  script: Array<{ type: string; data: unknown }> = [];
  onExecute?: (ctx: AdapterContext) => void;
  onCancel?: () => void;

  execute(ctx: AdapterContext): AdapterHandle {
    if (this.onExecute) {
      this.onExecute(ctx);
    }
    
    // Process the scripted events asynchronously
    void (async () => {
      for (const event of this.script) {
        if (ctx.sseRes.writableEnded) break;
        ctx.sseRes.write(
          `data: ${JSON.stringify({
            ...event,
            executionId: ctx.execution.id,
            timestamp: new Date().toISOString(),
          })}\n\n`
        );
      }
    })();

    return {
      cancel: () => {
        if (this.onCancel) {
          this.onCancel();
        }
      },
    };
  }

  async health() {
    return { status: "available" as const };
  }
}

export function makeTestAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: "test-lifecycle-agent",
    canonicalId: "test-lifecycle-agent",
    name: "Test Lifecycle Agent",
    description: "Stub agent for lifecycle testing",
    category: "Testing",
    type: "rest", // Use rest to avoid python env resolver in _runAsync
    version: "1.0.0",
    capabilities: [],
    workingDirectory: "/tmp",
    entrypoint: "http://localhost:9999",
    source: "workspace",
    logicalPath: "test-lifecycle-agent",
    containerPath: "/tmp",
    resolvedPath: "/tmp",
    isDockerCompatible: false,
    secrets: { required: [], optional: [] },
    inputSchema: { type: "object", properties: {} },
    outputFiles: [],
    usesWdLock: false,
    isExternal: false,
    ...overrides,
  };
}

export function makeExecution(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  const uniqueId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  return {
    id: uniqueId,
    agentId: "test-lifecycle-agent",
    status: "queued",
    startTime: new Date().toISOString(),
    runDir: "",
    logPath: "",
    input: { test: true },
    ...overrides,
  };
}

export async function cleanTables() {
  try {
    await prisma.$transaction([
      prisma.execution.deleteMany(),
      prisma.agent.deleteMany(),
    ]);
  } catch (err) {
    console.error("cleanTables failed:", err);
    throw err;
  }
}

export async function setupTestEnv() {
  await prisma.$disconnect().catch(() => {});
  if (fs.existsSync(TEST_DATA_DIR)) {
    try {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    } catch {
      // best effort if locked
    }
  }
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

  execSync("npx prisma migrate deploy", {
    cwd: path.join(WORKSPACE_ROOT, "apps/gateway"),
    stdio: "ignore",
  });
  await repo.init();
}

export async function teardownTestEnv() {
  await cleanTables();
  await prisma.$disconnect().catch(() => {});
  if (fs.existsSync(TEST_DATA_DIR)) {
    try {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
}

/**
 * Polls the DB until the execution reaches the specified status or times out.
 */
export async function waitForExecutionStatus(
  id: string,
  status: ExecutionStatus,
  timeoutMs = 2000
): Promise<ExecutionRecord> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const record = await repo.getById(id);
    if (record && record.status === status) {
      return record;
    }
    await new Promise((res) => setTimeout(res, 50));
  }
  const lastRecord = await repo.getById(id);
  throw new Error(
    `Timed out waiting for execution ${id} to reach status ${status}. Current status is ${
      lastRecord?.status ?? "not found"
    }`
  );
}

/**
 * Polls the DB until the execution reaches a terminal status or times out.
 */
export async function waitForTerminalState(id: string, timeoutMs = 2000): Promise<ExecutionRecord> {
  const start = Date.now();
  const terminalStates: ExecutionStatus[] = ["completed", "failed", "cancelled", "timeout"];
  while (Date.now() - start < timeoutMs) {
    const record = await repo.getById(id);
    if (record && terminalStates.includes(record.status)) {
      return record;
    }
    await new Promise((res) => setTimeout(res, 50));
  }
  const lastRecord = await repo.getById(id);
  throw new Error(
    `Timed out waiting for execution ${id} to reach a terminal state. Current status is ${
      lastRecord?.status ?? "not found"
    }`
  );
}
