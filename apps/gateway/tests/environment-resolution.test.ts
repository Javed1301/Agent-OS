import test, { before, after } from "node:test";
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
const FIXTURE_DIR = path.join(WORKSPACE_ROOT, "tmp", "test-env-fixtures");

let originalResolve: typeof agentSourceResolver.resolve;
let originalDiscover: typeof environmentDiscoveryService.discover;
let originalGetMetadata: typeof environmentDiscoveryService.getEnvironmentMetadata;

before(() => {
  // Create temporary disk fixture directory for deterministic test isolation
  fs.mkdirSync(path.join(FIXTURE_DIR, "agents", "beginner"), { recursive: true });
  fs.mkdirSync(path.join(FIXTURE_DIR, "agents", "myntra-rag"), { recursive: true });

  fs.writeFileSync(
    path.join(FIXTURE_DIR, "agents", "beginner", "agent.yaml"),
    "id: hate-speech\nname: Hate Speech Detector\npython: '3.11'\n",
    "utf-8"
  );

  fs.writeFileSync(
    path.join(FIXTURE_DIR, "agents", "myntra-rag", "agent.yaml"),
    "id: myntra-rag\nname: Myntra RAG\npython: '3.11'\n",
    "utf-8"
  );

  // Real requirements.txt file with unsatisfied version requirements to trigger CREATE_MANAGED_RUNTIME fallback
  fs.writeFileSync(
    path.join(FIXTURE_DIR, "agents", "myntra-rag", "requirements.txt"),
    "langchain==99.0.0\nfaiss-cpu>=99.0.0\n",
    "utf-8"
  );

  // Scoped mock for agentSourceResolver.resolve to map fixture paths deterministically
  originalResolve = agentSourceResolver.resolve.bind(agentSourceResolver);
  agentSourceResolver.resolve = (agentId: string, manifestWd?: string, manifestEntrypoint?: string) => {
    const startId = agentId;
    const resolvedId = agentId === "hate-speech-detector" ? "hate-speech" : agentId;

    if (resolvedId === "hate-speech") {
      return {
        agentId: startId,
        sourceRoot: path.join(FIXTURE_DIR, "agents", "beginner").replace(/\\/g, "/"),
        entrypoint: "hate-speech",
        dependencyDescriptor: "none",
      };
    }

    if (resolvedId === "myntra-rag") {
      const sourceRoot = path.join(FIXTURE_DIR, "agents", "myntra-rag").replace(/\\/g, "/");
      const descriptorPath = path.join(sourceRoot, "requirements.txt").replace(/\\/g, "/");
      return {
        agentId: startId,
        sourceRoot,
        entrypoint: "myntra-rag",
        dependencyDescriptor: "requirements.txt",
        descriptorPath,
      };
    }

    return originalResolve(agentId, manifestWd, manifestEntrypoint);
  };

  // Scoped mock for environmentDiscoveryService.discover when sourceRoot is provided
  originalDiscover = environmentDiscoveryService.discover.bind(environmentDiscoveryService);
  environmentDiscoveryService.discover = async (sourceRoot?: string) => {
    if (sourceRoot) {
      const isWindows = process.platform === "win32";
      const dummyVenvBin = path.join(FIXTURE_DIR, ".venv311", isWindows ? "Scripts/python.exe" : "bin/python").replace(/\\/g, "/");
      const systemBin = isWindows ? "C:/Python311/python.exe" : "/usr/bin/python3.11";

      return [
        {
          id: "ENV-VENV-1",
          type: "venv" as const,
          pythonVersion: "3.11.16",
          executablePath: dummyVenvBin,
          environmentRoot: path.join(FIXTURE_DIR, ".venv311").replace(/\\/g, "/"),
          platform: process.platform,
          discoveredFrom: "Parent Project Local: .venv311",
          packages: {
            pip: "24.0",
          },
        },
        {
          id: "ENV-SYSTEM-1",
          type: "system" as const,
          pythonVersion: "3.11.16",
          executablePath: systemBin,
          platform: process.platform,
          discoveredFrom: "System Path",
          packages: {},
        },
      ];
    }
    return originalDiscover();
  };

  // Scoped mock for environmentDiscoveryService.getEnvironmentMetadata
  originalGetMetadata = environmentDiscoveryService.getEnvironmentMetadata.bind(environmentDiscoveryService);
  environmentDiscoveryService.getEnvironmentMetadata = async (execPath: string) => {
    if (execPath.includes(".venv311") || execPath.includes("Python311") || execPath.includes("python3.11")) {
      return {
        pythonVersion: "3.11.16",
        packages: {
          pip: "24.0",
        },
      };
    }
    return originalGetMetadata(execPath);
  };
});

after(() => {
  // Restore mocks
  if (originalResolve) agentSourceResolver.resolve = originalResolve;
  if (originalDiscover) environmentDiscoveryService.discover = originalDiscover;
  if (originalGetMetadata) environmentDiscoveryService.getEnvironmentMetadata = originalGetMetadata;

  // Clean up temporary disk fixture directory
  if (fs.existsSync(FIXTURE_DIR)) {
    try {
      fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  }
});

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
