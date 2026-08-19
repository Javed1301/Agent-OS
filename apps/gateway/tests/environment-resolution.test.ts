import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { agentSourceResolver } from "../src/services/source-resolver.service.js";
import { environmentDiscoveryService } from "../src/services/discovery.service.js";
import { environmentCompatibilityService, compareVersions, normalizePackageName, parseRequirements } from "../src/services/compatibility.service.js";
import { environmentResolver } from "../src/services/environment-resolver.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../../../..");

test("1. Source Resolution Tests", async (t) => {
  await t.test("should resolve hate-speech mapped agent to beginner folder", () => {
    const res = agentSourceResolver.resolve("hate-speech");
    assert.strictEqual(res.agentId, "hate-speech");
    assert.strictEqual(res.sourceRoot.endsWith("agents/beginner"), true);
  });

  await t.test("should resolve hate-speech-detector alias to beginner folder", () => {
    const res = agentSourceResolver.resolve("hate-speech-detector");
    assert.strictEqual(res.agentId, "hate-speech-detector");
    assert.strictEqual(res.sourceRoot.endsWith("agents/beginner"), true);
  });

  await t.test("should resolve code-generator-agent to its external directory", () => {
    const res = agentSourceResolver.resolve("code-generator-agent");
    assert.strictEqual(res.sourceRoot.endsWith("external-agents/code-generator-agent"), true);
  });

  await t.test("should throw error for non-existent invalid agent ID", () => {
    assert.throws(() => {
      agentSourceResolver.resolve("invalid-agent-id-999");
    });
  });
});

test("2. Environment Discovery & Package Query", async (t) => {
  await t.test("should discover system Python environment", async () => {
    const envs = await environmentDiscoveryService.discover();
    assert.ok(envs.length > 0, "Should discover at least one environment");
    const systemEnv = envs.find((e) => e.type === "system");
    assert.ok(systemEnv, "Should discover system Python");
  });

  await t.test("should read Python interpreter version and packages without throwing", async () => {
    const envs = await environmentDiscoveryService.discover();
    const first = envs[0];
    const meta = await environmentDiscoveryService.getEnvironmentMetadata(first.executablePath);
    assert.ok(meta);
    assert.ok(typeof meta.pythonVersion === "string");
    assert.ok(typeof meta.packages === "object");
  });
});

test("3. Compatibility Check Tests", async (t) => {
  await t.test("compareVersions semver helper works correctly", () => {
    assert.strictEqual(compareVersions("3.11.15", "3.11.0"), 1);
    assert.strictEqual(compareVersions("3.11.5", "3.11.5"), 0);
    assert.strictEqual(compareVersions("1.14.2", "1.8.0"), 1);
    assert.strictEqual(compareVersions("0.28.0", "0.35.0"), -1);
  });

  await t.test("normalizePackageName converts packages correctly", () => {
    assert.strictEqual(normalizePackageName("faiss-cpu"), "faiss_cpu");
    assert.strictEqual(normalizePackageName("Langchain.Community"), "langchain_community");
  });

  await t.test("parseRequirements parses dependencies successfully", () => {
    const content = `
langchain==0.3.0
pandas>=2.2.0
numpy>=1.26.0,<2.0.0
# comment
    `;
    const parsed = parseRequirements(content, "requirements.txt");
    assert.strictEqual(parsed.length, 3);
    assert.deepStrictEqual(parsed[0], { name: "langchain", originalName: "langchain", operator: "==", version: "0.3.0" });
  });

  await t.test("evaluate fails if major/minor Python version mismatch", () => {
    const dummyEnv = {
      id: "ENV-DUMMY",
      type: "system" as const,
      pythonVersion: "3.13.7",
      executablePath: "python",
      platform: "win32",
      discoveredFrom: "test",
      packages: {},
    };
    const report = environmentCompatibilityService.evaluate(dummyEnv, "", "none", "3.11");
    assert.strictEqual(report.compatible, false);
    assert.match(report.reason, /Python version mismatch/);
  });

  await t.test("evaluate checks package requirements correctly", () => {
    const dummyEnv = {
      id: "ENV-DUMMY",
      type: "venv" as const,
      pythonVersion: "3.11.15",
      executablePath: "python",
      platform: "win32",
      discoveredFrom: "test",
      packages: {
        langchain: "0.3.0",
        pandas: "2.2.4",
      },
    };
    const reqs = "langchain==0.3.0\npandas>=2.2.0\nnumpy>=1.26.0";
    const report = environmentCompatibilityService.evaluate(dummyEnv, reqs, "requirements.txt", "3.11");
    assert.strictEqual(report.compatible, false);
    assert.deepStrictEqual(report.missingPackages, ["numpy"]);
  });
});

test("4. Resolution Policy Tests", async (t) => {
  await t.test("should reuse existing compatible parent environment for hate-speech", async () => {
    const res = await environmentResolver.resolve("hate-speech");
    assert.strictEqual(res.action, "REUSE_EXISTING");
    assert.ok(res.executablePath.includes(".venv311"), "Should select Outskill .venv311 environment");
  });

  await t.test("should fall back to CREATE_MANAGED_RUNTIME for agent with unsatisfied requirements", async () => {
    // We import an agent or test with high required package version that does not exist in local envs
    const dummyAgentWd = path.join(WORKSPACE_ROOT, "agents", "myntra-rag");
    const res = await environmentResolver.resolve("myntra-rag");
    assert.strictEqual(res.action, "CREATE_MANAGED_RUNTIME");
  });
});

test("5. Windows Path Portability & Compatibility", () => {
  const winPath = "D:\\Javed\\outskill\\outskill\\agents\\beginner";
  const nixPath = "/app/agents/beginner";

  assert.strictEqual(winPath.replace(/\\/g, "/"), "D:/Javed/outskill/outskill/agents/beginner");
  assert.strictEqual(path.isAbsolute(winPath) || /^[a-zA-Z]:[\\/]/.test(winPath), true);
  assert.strictEqual(path.isAbsolute(nixPath), true);
});
