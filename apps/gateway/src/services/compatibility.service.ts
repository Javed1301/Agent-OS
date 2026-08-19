import fs from "node:fs";
import path from "node:path";
import type { PythonEnvironment } from "./discovery.service.js";

export interface Requirement {
  name: string; // Normalized to lowercase and underscores
  originalName: string;
  operator?: string; // e.g. ">=", "=="
  version?: string;
}

export interface CompatibilityReport {
  compatible: boolean;
  score: number;
  reason: string;
  missingPackages: string[];
  versionMismatches: string[];
}

/**
 * Compare two semver/version strings.
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal.
 */
export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(/[.-]/).map((p) => parseInt(p, 10) || 0);
  const parts2 = v2.split(/[.-]/).map((p) => parseInt(p, 10) || 0);
  const len = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < len; i++) {
    const val1 = parts1[i] ?? 0;
    const val2 = parts2[i] ?? 0;
    if (val1 > val2) return 1;
    if (val1 < val2) return -1;
  }
  return 0;
}

/**
 * Normalizes a package name for comparison.
 * e.g., "Faiss-CPU" -> "faiss_cpu"
 */
export function normalizePackageName(name: string): string {
  return name.trim().toLowerCase().replace(/[-.]/g, "_");
}

/**
 * Parses package requirements from content.
 */
export function parseRequirements(content: string, sourceType: string): Requirement[] {
  const requirements: Requirement[] = [];

  if (sourceType === "requirements.txt" || sourceType === "uv.lock" || sourceType === "pyproject.toml") {
    // Standard requirements parser
    const lines = content.split("\n");
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith("#") || line.startsWith("-")) continue;

      // Clean up inline comments
      const cleanLine = line.split("#")[0].trim();
      if (!cleanLine) continue;

      // Extract dependencies from pyproject.toml / uv.lock dependencies arrays or TOML sections
      // In uv.lock, packages are defined as:
      // name = "crewai"
      // version = "0.28.0"
      if (sourceType === "uv.lock") {
        const nameMatch = cleanLine.match(/^name\s*=\s*"([^"]+)"/);
        const versionMatch = cleanLine.match(/^version\s*=\s*"([^"]+)"/);
        if (nameMatch) {
          const originalName = nameMatch[1];
          requirements.push({
            name: normalizePackageName(originalName),
            originalName,
          });
        }
        continue;
      }

      // requirements.txt and pyproject.toml parser
      // e.g. crewai>=0.28.0
      // e.g. dependencies = [ "crewai>=0.28.0" ]
      const cleanRequirementStr = cleanLine.replace(/['",\[\]]/g, "").trim();

      const regex = /^([a-zA-Z0-9_\-\[\]\.]+)\s*([>=<!~]+)?\s*([0-9a-zA-Z\.\-]+)?/;
      const match = cleanRequirementStr.match(regex);
      if (match) {
        const originalName = match[1];
        const operator = match[2];
        const version = match[3];

        requirements.push({
          name: normalizePackageName(originalName),
          originalName,
          operator,
          version,
        });
      }
    }
  }

  return requirements;
}

export const environmentCompatibilityService = {
  /**
   * Evaluates if a python environment satisfies the agent requirements.
   */
  evaluate(
    env: PythonEnvironment,
    requirementsContent: string,
    sourceType: string,
    requiredPythonVersion = "3.11"
  ): CompatibilityReport {
    const report: CompatibilityReport = {
      compatible: true,
      score: 100,
      reason: "Environment is fully compatible.",
      missingPackages: [],
      versionMismatches: [],
    };

    // 1. Python version compatibility
    // Agent requires "3.11", so CPython version must start with "3.11"
    const reqVersionParts = requiredPythonVersion.split(".");
    const envVersionParts = env.pythonVersion.split(".");

    const majorMatch = envVersionParts[0] === reqVersionParts[0];
    const minorMatch = envVersionParts[1] === reqVersionParts[1];

    if (!majorMatch || !minorMatch) {
      return {
        compatible: false,
        score: 0,
        reason: `Python version mismatch: Environment is ${env.pythonVersion}, required is ${requiredPythonVersion}.x`,
        missingPackages: [],
        versionMismatches: [],
      };
    }

    // 2. Package compatibility
    if (sourceType === "none" || !requirementsContent.trim()) {
      return report; // No dependencies required
    }

    const requirements = parseRequirements(requirementsContent, sourceType);
    const envPackages = env.packages || {};

    for (const req of requirements) {
      const envVersion = envPackages[req.name];
      if (!envVersion) {
        report.missingPackages.push(req.originalName);
        continue;
      }

      if (req.operator && req.version) {
        let satisfied = false;
        try {
          const comp = compareVersions(envVersion, req.version);
          switch (req.operator) {
            case "==":
              satisfied = comp === 0;
              break;
            case ">=":
              satisfied = comp >= 0;
              break;
            case "<=":
              satisfied = comp <= 0;
              break;
            case ">":
              satisfied = comp > 0;
              break;
            case "<":
              satisfied = comp < 0;
              break;
            case "!=":
              satisfied = comp !== 0;
              break;
            case "~=":
              satisfied = comp >= 0; // standard approximation
              break;
            default:
              satisfied = true;
          }
        } catch {
          // If version format is unknown, fail compatibility check
          satisfied = false;
        }

        if (!satisfied) {
          report.versionMismatches.push(`${req.originalName}: environment possesses ${envVersion}, requires ${req.operator}${req.version}`);
        }
      }
    }

    // Evaluate compatibility status
    if (report.missingPackages.length > 0 || report.versionMismatches.length > 0) {
      report.compatible = false;
      report.score = Math.max(
        0,
        100 - (report.missingPackages.length * 15 + report.versionMismatches.length * 10)
      );
      report.reason = `Incompatible dependencies: missing packages: [${report.missingPackages.join(", ")}]; version mismatches: [${report.versionMismatches.join(", ")}]`;
    }

    return report;
  },
};
