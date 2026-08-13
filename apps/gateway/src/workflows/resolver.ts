import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../../../..");

/**
 * Resolves dot-separated nested path in an object (e.g. "plan.subtasks" inside {"plan": {"subtasks": [...]}})
 */
function getNestedValue(obj: any, pathParts: string[]): any {
  let current = obj;
  for (const part of pathParts) {
    if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Evaluates a single template expression (e.g. "workflow.input.goal" or "plan.output.plan")
 */
function evaluateExpression(
  expr: string,
  workflowInput: Record<string, unknown>,
  stepResults: Map<string, any>,
  stepExecIds: Map<string, string>,
  workflowRunId: string
): any {
  const parts = expr.trim().split(".");
  if (parts.length === 0) return undefined;

  const type = parts[0];

  // 1. Workflow Input resolution: e.g. workflow.input.goal
  if (type === "workflow" && parts[1] === "input") {
    const keyParts = parts.slice(2);
    return getNestedValue(workflowInput, keyParts);
  }

  // 2. Step resolution (e.g. plan.output or build.artifacts)
  const stepId = type;
  const stepEntry = stepResults.get(stepId);

  if (!stepEntry) {
    console.warn(`[resolver] Step '${stepId}' not executed yet or not found in stepResults.`);
    return undefined;
  }

  const prop = parts[1];

  // Artifacts directory resolution: e.g. build.artifacts -> resolves to workflow-level artifacts/<stepId>
  if (prop === "artifacts") {
    return stepEntry.artifacts;
  }

  // Output resolution: e.g. plan.output, plan.output.plan
  if (prop === "output") {
    const output = stepEntry.output;
    if (parts.length > 2) {
      return getNestedValue(output, parts.slice(2));
    }
    return output;
  }

  return undefined;
}

/**
 * Recursively resolves all template expressions inside inputs (strings, arrays, nested objects)
 */
export function resolveTemplate(
  template: any,
  workflowInput: Record<string, unknown>,
  stepResults: Map<string, any>,
  stepExecIds: Map<string, string>,
  workflowRunId: string
): any {
  if (typeof template === "string") {
    // Direct exact match: e.g. "${workflow.input.goal}" -> return raw type directly (prevents converting array to string)
    const exactMatch = template.match(/^\$\{(.+?)\}$/);
    if (exactMatch) {
      const expr = exactMatch[1];
      return evaluateExpression(expr, workflowInput, stepResults, stepExecIds, workflowRunId);
    }

    // String interpolation: e.g. "Path is: ${build.artifacts}"
    return template.replace(/\$\{(.+?)\}/g, (match, expr) => {
      const val = evaluateExpression(expr, workflowInput, stepResults, stepExecIds, workflowRunId);
      return typeof val === "object" ? JSON.stringify(val) : String(val ?? "");
    });
  }

  if (Array.isArray(template)) {
    return template.map((item) =>
      resolveTemplate(item, workflowInput, stepResults, stepExecIds, workflowRunId)
    );
  }

  if (template !== null && typeof template === "object") {
    const resolved: Record<string, any> = {};
    for (const [key, value] of Object.entries(template)) {
      resolved[key] = resolveTemplate(value, workflowInput, stepResults, stepExecIds, workflowRunId);
    }
    return resolved;
  }

  return template;
}
