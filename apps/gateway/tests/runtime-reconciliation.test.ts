import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runtimeService } from "../src/services/runtime.service.js";
import type { RuntimeMetadata } from "../src/types/runtime.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");
const RUNTIMES_DIR = path.join(WORKSPACE_ROOT, "runtimes", "py311");

test("Runtime Association Reconciliation & Deletion Safety", async (t) => {
  const hashA = "test_hash_aaaaaa";
  const hashB = "test_hash_bbbbbb";
  const agentId = "test-migrating-agent";

  // Ensure test cleanup on completion
  t.after(() => {
    try {
      fs.rmSync(path.join(RUNTIMES_DIR, hashA), { recursive: true, force: true });
      fs.rmSync(path.join(RUNTIMES_DIR, hashB), { recursive: true, force: true });
    } catch {}
  });

  // Setup mock metadata for Runtime A (legacy) and Runtime B (new)
  const metaA: RuntimeMetadata = {
    hash: hashA,
    python: "3.11",
    pythonShort: "py311",
    agents: [agentId],
    agentCount: 1,
    sizeBytes: 1024,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    sourceHash: hashA,
    sourceType: "requirements.txt",
    state: "available",
  };

  const metaB: RuntimeMetadata = {
    hash: hashB,
    python: "3.11",
    pythonShort: "py311",
    agents: [],
    agentCount: 0,
    sizeBytes: 2048,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    sourceHash: hashB,
    sourceType: "requirements.txt",
    state: "available",
  };

  runtimeService.saveMetadata(metaA);
  runtimeService.saveMetadata(metaB);

  await t.test("Initial state: Runtime A has agent, Runtime B is empty", () => {
    const fetchedA = runtimeService.getMetadata(hashA);
    const fetchedB = runtimeService.getMetadata(hashB);
    assert.strictEqual(fetchedA?.agentCount, 1);
    assert.deepStrictEqual(fetchedA?.agents, [agentId]);
    assert.strictEqual(fetchedB?.agentCount, 0);
  });

  await t.test("Deleting active Runtime A fails with safety error", () => {
    assert.throws(
      () => runtimeService.deleteRuntime(hashA),
      /Cannot delete active runtime/
    );
  });

  await t.test("Agent migrates from Runtime A to Runtime B", () => {
    runtimeService.associateAgent(hashB, agentId);

    const updatedA = runtimeService.getMetadata(hashA);
    const updatedB = runtimeService.getMetadata(hashB);

    assert.strictEqual(updatedA?.agentCount, 0, "Runtime A should no longer count the migrated agent");
    assert.deepStrictEqual(updatedA?.agents, [], "Runtime A should not list the migrated agent");
    assert.strictEqual(updatedB?.agentCount, 1, "Runtime B should count the newly attached agent");
    assert.deepStrictEqual(updatedB?.agents, [agentId], "Runtime B should list the newly attached agent");
  });

  await t.test("Reconcile associations enforces active mapping invariant", () => {
    // Reconcile with active map mapping agentId -> hashB
    runtimeService.reconcileAssociations([{ agentId, runtimeHash: hashB }]);

    const reconciledA = runtimeService.getMetadata(hashA);
    const reconciledB = runtimeService.getMetadata(hashB);

    assert.strictEqual(reconciledA?.agentCount, 0);
    assert.strictEqual(reconciledB?.agentCount, 1);
  });

  await t.test("Orphaned Runtime A becomes cleanly deletable", () => {
    const result = runtimeService.deleteRuntime(hashA);
    assert.strictEqual(result, true);
    assert.strictEqual(runtimeService.getMetadata(hashA), null);
  });

  await t.test("Active Runtime B remains protected from deletion", () => {
    assert.throws(
      () => runtimeService.deleteRuntime(hashB),
      /Cannot delete active runtime/
    );
  });
});
