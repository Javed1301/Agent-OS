import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  isValidAgentId,
  isPathWithinRoot,
  isPathWithinAllowedRoots,
  WORKSPACE_ROOT,
  DATA_DIR,
} from "../src/services/path-safety.service.js";
import { registryService } from "../src/services/registry.service.js";

test.describe("Path Security & Containment Tests", () => {
  // ==========================================================================
  // 1. Agent ID Validation Unit Tests
  // ==========================================================================
  test.describe("Agent ID Validation (isValidAgentId)", () => {
    test("1. valid ID: planner-agent", () => {
      assert.strictEqual(isValidAgentId("planner-agent"), true);
    });

    test("2. valid ID: agent-123", () => {
      assert.strictEqual(isValidAgentId("agent-123"), true);
    });

    test("3. invalid ../evil", () => {
      assert.strictEqual(isValidAgentId("../evil"), false);
    });

    test("4. invalid ../../evil", () => {
      assert.strictEqual(isValidAgentId("../../evil"), false);
    });

    test("5. invalid foo/bar", () => {
      assert.strictEqual(isValidAgentId("foo/bar"), false);
    });

    test("6. invalid foo\\bar", () => {
      assert.strictEqual(isValidAgentId("foo\\bar"), false);
    });

    test("7. invalid absolute-path style ID", () => {
      assert.strictEqual(isValidAgentId("C:\\Windows\\System32"), false);
      assert.strictEqual(isValidAgentId("/etc/passwd"), false);
    });

    test("8. invalid uppercase ID", () => {
      assert.strictEqual(isValidAgentId("PlannerAgent"), false);
    });

    test("9. invalid ID containing spaces", () => {
      assert.strictEqual(isValidAgentId("planner agent"), false);
    });

    test("10. empty ID", () => {
      assert.strictEqual(isValidAgentId(""), false);
    });
  });

  // ==========================================================================
  // 2. importAgent() Traversal Protection & Filesystem Write Prevention
  // ==========================================================================
  test.describe("registryService.importAgent Filesystem Protection", () => {
    let tmpSourceDir: string;

    test.before(() => {
      tmpSourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-security-test-"));
    });

    test.after(() => {
      if (fs.existsSync(tmpSourceDir)) {
        fs.rmSync(tmpSourceDir, { recursive: true, force: true });
      }
    });

    test("verifies invalid manifest.id is rejected and causes NO filesystem writes outside external-agents", async () => {
      const invalidId = "../evil-agent-traversal";
      const manifestPath = path.join(tmpSourceDir, "agent.yaml");
      const yamlContent = `id: "${invalidId}"\nname: Evil Traversal Agent\nentrypoint: main.py\nworkingDirectory: .`;
      fs.writeFileSync(manifestPath, yamlContent, "utf-8");

      const result = await registryService.importAgent(tmpSourceDir);
      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes("Invalid agent ID"));

      // Verify that destination external-agents/../evil-agent-traversal was NOT created
      const escapedPath = path.resolve(WORKSPACE_ROOT, "external-agents", invalidId);
      assert.strictEqual(fs.existsSync(escapedPath), false, "Escaped destination path should NOT exist");
    });
  });

  // ==========================================================================
  // 3. Shell Path Containment Tests (isPathWithinRoot & isPathWithinAllowedRoots)
  // ==========================================================================
  test.describe("Shell Path Containment (isPathWithinRoot)", () => {
    test("1. valid workspace path accepted", () => {
      assert.strictEqual(isPathWithinRoot(WORKSPACE_ROOT, WORKSPACE_ROOT), true);
      const subDir = path.join(WORKSPACE_ROOT, "agents", "planner-agent");
      assert.strictEqual(isPathWithinRoot(subDir, WORKSPACE_ROOT), true);
    });

    test("2. valid data path accepted", () => {
      assert.strictEqual(isPathWithinRoot(DATA_DIR, DATA_DIR), true);
      const subDir = path.join(DATA_DIR, "executions");
      assert.strictEqual(isPathWithinRoot(subDir, DATA_DIR), true);
      assert.strictEqual(isPathWithinAllowedRoots(subDir), true);
    });

    test("3. outside workspace rejected", () => {
      const parentDir = path.resolve(WORKSPACE_ROOT, "..");
      assert.strictEqual(isPathWithinRoot(parentDir, WORKSPACE_ROOT), false);
      assert.strictEqual(isPathWithinRoot("C:\\Windows", WORKSPACE_ROOT), false);
      assert.strictEqual(isPathWithinRoot("/etc/passwd", WORKSPACE_ROOT), false);
    });

    test("4. outside data directory rejected", () => {
      const parentData = path.resolve(DATA_DIR, "..");
      assert.strictEqual(isPathWithinRoot(parentData, DATA_DIR), false);
    });

    test("5. traversal rejected", () => {
      const traversalPath = path.join(WORKSPACE_ROOT, "..", "secret-dir");
      assert.strictEqual(isPathWithinRoot(traversalPath, WORKSPACE_ROOT), false);
      assert.strictEqual(isPathWithinAllowedRoots(traversalPath), false);
    });

    test("6. prefix-collision path rejected", () => {
      const prefixCollisionCandidate = WORKSPACE_ROOT + "-malicious";
      assert.strictEqual(isPathWithinRoot(prefixCollisionCandidate, WORKSPACE_ROOT), false);
      assert.strictEqual(isPathWithinAllowedRoots(prefixCollisionCandidate), false);
    });
  });
});
