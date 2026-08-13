/**
 * Health Service
 *
 * Checks whether an agent is runnable by validating:
 *  1. Required environment variables are present
 *  2. Python interpreter exists (auto-resolved; subprocess agents only)
 *  3. Working directory exists
 *  4. HTTP endpoint is reachable (REST agents only)
 *
 * Environment resolution follows a true-fallback model:
 *   Local .env (from workingDirectory tree) overrides gateway process.env.
 *   If a required key is missing from local .env, the gateway .env is used.
 */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import dotenv from "dotenv";
import type { AgentDefinition, AgentHealthResult, HealthCheckItem } from "../types/agent.js";
import { secretsService } from "./secrets.service.js";
import { runtimeService } from "./runtime.service.js";

const execFileAsync = promisify(execFile);

// --------------------------------------------------------------------------
// .env parsing helpers
// --------------------------------------------------------------------------

function findDotenvPath(startDir: string): string | null {
  let current = startDir;
  while (true) {
    const candidate = path.join(current, ".env");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function parseLocalEnv(workingDirectory: string): Record<string, string> {
  const dotenvPath = findDotenvPath(workingDirectory);
  if (!dotenvPath) return {};
  try {
    const content = fs.readFileSync(dotenvPath, "utf-8");
    return dotenv.parse(content) as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * Compute which required keys are missing from vault, local .env AND gateway process.env.
 */
export function findMissingEnvKeys(agent: AgentDefinition): string[] {
  const required = agent.secrets?.required || agent.healthCheck.requiredEnv || [];
  return required.filter((key) => !secretsService.getSecret(key));
}

/**
 * Build environment object for launching an agent subprocess.
 * Priority (highest wins):
 *   1. Encrypted Local Vault secrets
 *   2. Local .env values from workingDirectory
 *   3. process.env baseline
 */
export function buildSpawnEnv(agent: AgentDefinition): NodeJS.ProcessEnv {
  const localKeys = parseLocalEnv(agent.workingDirectory);
  const vaultSecrets = secretsService.getSecretsForAgent(agent);
  return { ...process.env, PYTHONUNBUFFERED: "1", ...localKeys, ...vaultSecrets };
}

/**
 * Normalize REST agent endpoints for Docker compatibility.
 * If DOCKER_ENV=true and URL uses localhost/127.0.0.1, convert to host.docker.internal.
 */
export function getEffectiveEndpoint(endpoint?: string): { configuredEndpoint?: string; effectiveEndpoint?: string } {
  if (!endpoint) return {};
  const configuredEndpoint = endpoint;
  let effectiveEndpoint = endpoint;

  const isDocker = process.env["DOCKER_ENV"] === "true" || fs.existsSync("/.dockerenv");
  if (isDocker) {
    effectiveEndpoint = effectiveEndpoint.replace(/localhost|127\.0\.0\.1/g, "host.docker.internal");
  }

  return { configuredEndpoint, effectiveEndpoint };
}

// --------------------------------------------------------------------------
// Health check: subprocess agents
// --------------------------------------------------------------------------

async function checkSubprocessAgent(agent: AgentDefinition): Promise<AgentHealthResult> {
  const base: Omit<AgentHealthResult, "status" | "detail"> = {
    agentId: agent.id,
    checkedAt: new Date().toISOString(),
    logicalPath: agent.logicalPath || agent.workingDirectory,
    resolvedPath: agent.resolvedPath || agent.workingDirectory,
    isDockerCompatible: agent.isDockerCompatible ?? true,
  };

  const checks: HealthCheckItem[] = [];
  let isUnavailable = false;
  let hasWarning = false;

  // Check 1: Path portability
  if (agent.isDockerCompatible === false) {
    hasWarning = true;
    checks.push({
      label: "Path Portability",
      status: "warn",
      detail: `Host-absolute path: ${agent.workingDirectory} (not Docker/git portable)`,
    });
  } else {
    checks.push({
      label: "Path Portability",
      status: "pass",
      detail: `Logical: ${agent.logicalPath || agent.workingDirectory} -> Resolved: ${agent.resolvedPath || agent.workingDirectory}`,
    });
  }

  // Check 2: Working directory
  const wdExists = fs.existsSync(agent.workingDirectory);
  if (!wdExists) {
    isUnavailable = true;
    checks.push({
      label: "Working Directory",
      status: "fail",
      detail: `Not found at: ${agent.workingDirectory}`,
    });
  } else {
    checks.push({
      label: "Working Directory",
      status: "pass",
      detail: agent.resolvedPath || agent.workingDirectory,
    });
  }

  // Check 3: Entrypoint Validation
  const hasExtension = path.extname(agent.entrypoint) !== "";
  const entrypointAbs = path.isAbsolute(agent.entrypoint)
    ? agent.entrypoint
    : path.join(agent.workingDirectory, agent.entrypoint);
  const fileExists = fs.existsSync(entrypointAbs) || fs.existsSync(`${entrypointAbs}.py`);

  if (hasExtension) {
    if (fileExists) {
      checks.push({
        label: "Entrypoint File",
        status: "pass",
        detail: `Python file found at: ${entrypointAbs}`,
      });
    } else {
      checks.push({
        label: "Entrypoint File",
        status: "warn",
        detail: `Python file not found: ${entrypointAbs}`,
      });
    }
  } else if (fileExists) {
    checks.push({
      label: "Entrypoint File",
      status: "pass",
      detail: `Python file found at: ${entrypointAbs}`,
    });
  } else {
    checks.push({
      label: "Entrypoint File",
      status: "pass",
      detail: `Module/CLI entrypoint assumed: ${agent.entrypoint}`,
    });
  }

  // Check 4: Python interpreter
  const interpreterPath = agent.interpreterPath;
  let interpreterFound = false;
  if (!interpreterPath) {
    isUnavailable = true;
    checks.push({
      label: "Python Environment",
      status: "fail",
      detail: "No Python interpreter found.",
    });
  } else if (interpreterPath === "python") {
    interpreterFound = true;
    hasWarning = true;
    checks.push({
      label: "Python Environment",
      status: "warn",
      detail: "Using system Python (no virtual environment detected).",
    });
  } else {
    const interpExists = fs.existsSync(interpreterPath);
    if (!interpExists) {
      isUnavailable = true;
      checks.push({
        label: "Python Environment",
        status: "fail",
        detail: `Interpreter not found: ${interpreterPath}`,
      });
    } else {
      interpreterFound = true;
      checks.push({
        label: "Python Environment",
        status: "pass",
        detail: `Virtual env: ${interpreterPath}`,
      });
    }
  }

  // Check 4b: Runtime Diagnostics & Stale Detection
  let runtimeHash = agent.runtime?.hash;
  let runtimeState = "none";
  let isStale = false;
  let runtimeBadgeStatus: "managed" | "fallback" | "stale" | "building" | "failed" = "fallback";
  let filesChecked = {
    "uv.lock": false,
    "pyproject.toml": false,
    "requirements.txt": false,
  };

  if (agent.workingDirectory && fs.existsSync(agent.workingDirectory)) {
    try {
      const depInfo = runtimeService.detectDependencies(agent.workingDirectory);
      filesChecked = depInfo.filesChecked;

      if (depInfo.sourceType !== "none") {
        runtimeHash = depInfo.runtimeHash;
        const meta = runtimeService.getMetadata(depInfo.runtimeHash);
        if (meta) {
          runtimeState = meta.state;
          // Check stale condition
          if (meta.sourceHash !== depInfo.sourceHash) {
            isStale = true;
            runtimeBadgeStatus = "stale";
            hasWarning = true;
            checks.push({
              label: "Runtime Dependencies",
              status: "warn",
              detail: `Dependency file changed (${depInfo.sourceType}). Runtime ${depInfo.runtimeHash} is stale. Rebuild required.`,
            });
          } else if (meta.state === "available") {
            runtimeBadgeStatus = "managed";
            checks.push({
              label: "Managed Runtime",
              status: "pass",
              detail: `Hash: ${meta.hash} (${meta.sourceType}, ${meta.agentCount} agent(s) attached)`,
            });
          } else if (meta.state === "building") {
            runtimeBadgeStatus = "building";
            hasWarning = true;
            checks.push({
              label: "Managed Runtime",
              status: "warn",
              detail: `Hash: ${meta.hash} state: building`,
            });
          } else if (meta.state === "error") {
            runtimeBadgeStatus = "failed";
            hasWarning = true;
            checks.push({
              label: "Managed Runtime",
              status: "warn",
              detail: `Hash: ${meta.hash} state: error (${meta.errorMessage})`,
            });
          } else {
            runtimeBadgeStatus = "fallback";
            hasWarning = true;
            checks.push({
              label: "Managed Runtime",
              status: "warn",
              detail: `Hash: ${meta.hash} state: ${meta.state}`,
            });
          }
        } else {
          runtimeBadgeStatus = "fallback";
          checks.push({
            label: "Managed Runtime",
            status: "warn",
            detail: `Dependencies detected (${depInfo.sourceType}) but runtime is not installed yet.`,
          });
        }
      } else {
        runtimeBadgeStatus = "fallback";
        checks.push({
          label: "Dependency Descriptor",
          status: "pass",
          detail: "No dependency descriptor found. Using system Python interpreter fallback.",
        });
      }
    } catch {
      /* ignore */
    }
  }

  // Check 5: Required Secrets
  const requiredKeys = agent.secrets?.required || agent.healthCheck.requiredEnv || [];
  const missingRequired = requiredKeys.filter((k) => !secretsService.getSecret(k));

  if (requiredKeys.length === 0) {
    checks.push({
      label: "Required Secrets",
      status: "pass",
      detail: "No required secrets declared",
    });
  } else if (missingRequired.length > 0) {
    isUnavailable = true;
    checks.push({
      label: "Required Secrets",
      status: "fail",
      detail: `Missing required: ${missingRequired.join(", ")}`,
    });
  } else {
    checks.push({
      label: "Required Secrets",
      status: "pass",
      detail: `All present: ${requiredKeys.join(", ")}`,
    });
  }

  // Check 6: Optional Secrets
  const optionalKeys = agent.secrets?.optional || [];
  const missingOptional = optionalKeys.filter((k) => !secretsService.getSecret(k));

  if (optionalKeys.length > 0) {
    if (missingOptional.length > 0) {
      hasWarning = true;
      checks.push({
        label: "Optional Secrets",
        status: "warn",
        detail: `Missing optional: ${missingOptional.join(", ")}`,
      });
    } else {
      checks.push({
        label: "Optional Secrets",
        status: "pass",
        detail: `All present: ${optionalKeys.join(", ")}`,
      });
    }
  }

  // Determine final status
  const status = isUnavailable ? "unavailable" : hasWarning ? "warning" : "available";
  const detail = isUnavailable
    ? missingRequired.length > 0
      ? `Missing required secrets: ${missingRequired.join(", ")}`
      : "Agent dependencies or entrypoint missing."
    : hasWarning
    ? missingOptional.length > 0
      ? `Optional secrets missing: ${missingOptional.join(", ")}`
      : "Non-critical configuration warning."
    : "Agent is fully configured and ready for execution.";

  return {
    ...base,
    status,
    detail,
    missingRequiredSecrets: missingRequired,
    missingOptionalSecrets: missingOptional,
    missingEnv: missingRequired,
    interpreterFound,
    interpreterPath,
    runtimeHash,
    runtimeState,
    runtimeBadgeStatus,
    isStale,
    filesChecked,
    checks,
  };
}

// --------------------------------------------------------------------------
// Health check: REST/HTTP agents
// --------------------------------------------------------------------------

function httpGet(url: string, timeoutMs = 5000): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
  });
}

async function checkRestAgent(agent: AgentDefinition): Promise<AgentHealthResult> {
  const { configuredEndpoint, effectiveEndpoint } = getEffectiveEndpoint(agent.healthCheck.endpoint);
  const base: Omit<AgentHealthResult, "status" | "detail"> = {
    agentId: agent.id,
    checkedAt: new Date().toISOString(),
    logicalPath: agent.logicalPath || agent.workingDirectory,
    resolvedPath: agent.resolvedPath || agent.workingDirectory,
    isDockerCompatible: agent.isDockerCompatible ?? true,
    configuredEndpoint,
    effectiveEndpoint,
  };

  const checks: HealthCheckItem[] = [];
  let isUnavailable = false;
  let hasWarning = false;

  if (!effectiveEndpoint) {
    checks.push({
      label: "Health Endpoint",
      status: "fail",
      detail: "No health endpoint URL configured in agent.yaml",
    });
    return { ...base, status: "unavailable", detail: "No health endpoint configured.", checks };
  }

  if (configuredEndpoint !== effectiveEndpoint) {
    checks.push({
      label: "REST Endpoint Normalization",
      status: "pass",
      detail: `Configured: ${configuredEndpoint} -> Docker Effective: ${effectiveEndpoint}`,
    });
  } else {
    checks.push({
      label: "REST Endpoint",
      status: "pass",
      detail: effectiveEndpoint,
    });
  }

  // Check Secrets for REST Agent
  const requiredKeys = agent.secrets?.required || agent.healthCheck.requiredEnv || [];
  const missingRequired = requiredKeys.filter((k) => !secretsService.getSecret(k));
  const optionalKeys = agent.secrets?.optional || [];
  const missingOptional = optionalKeys.filter((k) => !secretsService.getSecret(k));

  if (requiredKeys.length > 0 && missingRequired.length > 0) {
    isUnavailable = true;
    checks.push({
      label: "Required Secrets",
      status: "fail",
      detail: `Missing required: ${missingRequired.join(", ")}`,
    });
  } else if (requiredKeys.length > 0) {
    checks.push({
      label: "Required Secrets",
      status: "pass",
      detail: `All present: ${requiredKeys.join(", ")}`,
    });
  }

  if (optionalKeys.length > 0) {
    if (missingOptional.length > 0) {
      hasWarning = true;
      checks.push({
        label: "Optional Secrets",
        status: "warn",
        detail: `Missing optional: ${missingOptional.join(", ")}`,
      });
    } else {
      checks.push({
        label: "Optional Secrets",
        status: "pass",
        detail: `All present: ${optionalKeys.join(", ")}`,
      });
    }
  }

  try {
    const { statusCode, body } = await httpGet(effectiveEndpoint, 5000);
    if (statusCode === 200) {
      checks.push({
        label: "HTTP Reachability",
        status: "pass",
        detail: `HTTP 200 response from ${effectiveEndpoint}`,
      });
      const status = isUnavailable ? "unavailable" : hasWarning ? "warning" : "available";
      return {
        ...base,
        status,
        detail: `HTTP 200 from ${effectiveEndpoint}`,
        endpointReachable: true,
        missingRequiredSecrets: missingRequired,
        missingOptionalSecrets: missingOptional,
        checks,
      };
    }

    checks.push({
      label: "HTTP Reachability",
      status: "fail",
      detail: `HTTP ${statusCode} from ${effectiveEndpoint}`,
    });
    return {
      ...base,
      status: "unavailable",
      detail: `HTTP ${statusCode} from ${effectiveEndpoint}`,
      endpointReachable: false,
      missingRequiredSecrets: missingRequired,
      missingOptionalSecrets: missingOptional,
      checks,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.push({
      label: "HTTP Reachability",
      status: "fail",
      detail: `Connection failed: ${msg}`,
    });
    return {
      ...base,
      status: "unavailable",
      detail: `Connection failed: ${msg}`,
      endpointReachable: false,
      missingRequiredSecrets: missingRequired,
      missingOptionalSecrets: missingOptional,
      checks,
    };
  }
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

export const healthService = {
  async checkAgent(agent: AgentDefinition): Promise<AgentHealthResult> {
    if (agent.healthCheck.type === "http" || agent.type === "rest") {
      return checkRestAgent(agent);
    }
    return checkSubprocessAgent(agent);
  },

  async checkAll(agents: AgentDefinition[]): Promise<AgentHealthResult[]> {
    return Promise.all(agents.map((a) => this.checkAgent(a)));
  },

  buildSpawnEnv,
  findMissingEnvKeys,
  getEffectiveEndpoint,
};

