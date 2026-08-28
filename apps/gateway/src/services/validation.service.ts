/**
 * Validation Service
 *
 * Validates execution input payloads against the agent's inputSchema.
 */

import type { AgentDefinition } from "../types/agent.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates an incoming execution request payload against an AgentDefinition's inputSchema.
 */
export function validateAgentInput(
  agent: AgentDefinition,
  input: unknown
): ValidationResult {
  const errors: string[] = [];

  // Rule A: Request body must be a non-null plain object
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return {
      valid: false,
      errors: ["Request body must be a non-null JSON object."],
    };
  }

  const inputObj = input as Record<string, unknown>;
  const declaredProperties = agent.inputSchema?.properties ?? {};

  // Rule E: Reject unknown fields not declared in agent.inputSchema.properties
  for (const key of Object.keys(inputObj)) {
    if (!Object.prototype.hasOwnProperty.call(declaredProperties, key)) {
      errors.push(`Unknown input field '${key}'.`);
    }
  }

  // Rule B, C, D: Validate every declared input field
  for (const [key, schema] of Object.entries(declaredProperties)) {
    const val = inputObj[key];
    const isRequired = Boolean(schema.required);

    // Rule C: Required fields check (treat undefined/null as missing)
    if (isRequired && (val === undefined || val === null)) {
      errors.push(`Missing required input field '${key}'.`);
      continue;
    }

    // Rule D: Primitive types check (if field is provided and not null/undefined)
    if (val !== undefined && val !== null) {
      const expectedType = schema.type;
      const actualType = typeof val;

      if (expectedType === "string") {
        if (actualType !== "string") {
          errors.push(`Input field '${key}' must be of type 'string', received ${actualType}.`);
        }
      } else if (expectedType === "number") {
        if (actualType !== "number" || !Number.isFinite(val as number)) {
          errors.push(`Input field '${key}' must be a finite number.`);
        }
      } else if (expectedType === "boolean") {
        if (actualType !== "boolean") {
          errors.push(`Input field '${key}' must be of type 'boolean', received ${actualType}.`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
