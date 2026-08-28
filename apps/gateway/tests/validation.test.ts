import test from "node:test";
import assert from "node:assert";
import { validateAgentInput } from "../src/services/validation.service.js";
import type { AgentDefinition } from "../src/types/agent.js";

function makeDummyAgent(): AgentDefinition {
  return {
    id: "test-agent",
    name: "Test Agent",
    description: "Agent for testing input validation",
    category: "Testing",
    type: "python",
    capabilities: [],
    workingDirectory: "agents/test-agent",
    entrypoint: "main.py",
    healthCheck: { type: "subprocess" },
    inputSchema: {
      type: "object",
      properties: {
        reqString: { type: "string", required: true, description: "Required string field" },
        optNumber: { type: "number", required: false, description: "Optional number field" },
        optBool: { type: "boolean", required: false, description: "Optional boolean field" },
      },
    },
  };
}

test.describe("validateAgentInput — Unit Tests", () => {
  const agent = makeDummyAgent();

  test("1. Valid payload with required field", () => {
    const res = validateAgentInput(agent, { reqString: "hello" });
    assert.strictEqual(res.valid, true);
    assert.deepStrictEqual(res.errors, []);
  });

  test("2. Missing required field", () => {
    const res = validateAgentInput(agent, {});
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Missing required input field 'reqString'")));
  });

  test("3. Wrong string type", () => {
    const res = validateAgentInput(agent, { reqString: 12345 });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("must be of type 'string'")));
  });

  test("4. Wrong number type", () => {
    const res = validateAgentInput(agent, { reqString: "hello", optNumber: "not-a-number" });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("must be a finite number")));
  });

  test("5. Wrong boolean type", () => {
    const res = validateAgentInput(agent, { reqString: "hello", optBool: "true-string" });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("must be of type 'boolean'")));
  });

  test("6. Non-finite number (NaN/Infinity)", () => {
    const resNaN = validateAgentInput(agent, { reqString: "hello", optNumber: NaN });
    assert.strictEqual(resNaN.valid, false);
    assert.ok(resNaN.errors.some((e) => e.includes("must be a finite number")));

    const resInf = validateAgentInput(agent, { reqString: "hello", optNumber: Infinity });
    assert.strictEqual(resInf.valid, false);
    assert.ok(resInf.errors.some((e) => e.includes("must be a finite number")));
  });

  test("7. Unknown field", () => {
    const res = validateAgentInput(agent, { reqString: "hello", extraField: "unsupported" });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Unknown input field 'extraField'")));
  });

  test("8. null body", () => {
    const res = validateAgentInput(agent, null);
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Request body must be a non-null JSON object")));
  });

  test("9. array body", () => {
    const res = validateAgentInput(agent, ["item1", "item2"]);
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Request body must be a non-null JSON object")));
  });

  test("10. Optional field omitted", () => {
    const res = validateAgentInput(agent, { reqString: "valid string" });
    assert.strictEqual(res.valid, true);
    assert.deepStrictEqual(res.errors, []);
  });

  test("11. Optional field with correct type", () => {
    const res = validateAgentInput(agent, { reqString: "valid string", optNumber: 42, optBool: true });
    assert.strictEqual(res.valid, true);
    assert.deepStrictEqual(res.errors, []);
  });

  test("12. Optional field with incorrect type", () => {
    const res = validateAgentInput(agent, { reqString: "valid string", optNumber: true });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("must be a finite number")));
  });
});
