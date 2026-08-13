import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import dotenv from "dotenv";
import type { AgentDefinition, AgentHealthResult } from "../types/agent.js";

const execFileAsync = promisify(execFile);

// --------------------------------------------------------------------------
// Helper: parse a .env file from a given directory path without executing Python.
// Searches the directory tree upwards for the first .env file, mirroring
// python-dotenv's default behaviour.
// --------------------------------------------------------------------------

function findDotenvPath(startDir: string): string | null {
  let current = startDir;
  while (true) {
    const candidate = path.join(current, ".env");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null; // reached filesystem root
    current = parent;
  }
}

/**
 * Parse the local .env file reachable from the agent's workingDirectory.
 * Returns {} if no .env is found.
 */
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
 * Compute which requiredEnv keys are missing from BOTH the local .env AND
 * the gateway's process.env. Used to determine misconfigured status.
 */
export function findMissingEnvKeys(agent: AgentDefinition): string[] {
  const localKeys = parseLocalEnv(agent.workingDirectory);
  return agent.healthCheck.requiredEnv.filter(
    (key) => !(key in localKeys) && !process.env[key]
  );
}

/**
 * Build the environment object for spawning a Python subprocess.
 *
 * True-fallback model:
 *   1. Parse agent's local .env → localKeys
 *   2. For each requiredEnv key absent from localKeys, inject from gateway process.env
 *   3. Merge: process.env baseline + localKeys (local WINS) + gateway fallbacks for gaps
 *
 * podcaster_crew has no .env → localKeys={}, gateway must inject GEMINI_API_KEY + SERPER_API_KEY.
 * outskill agents have shared root .env containing OPENROUTER_API_KEY + EXA_API_KEY → gateway injects nothing.
 */
export function buildSpawnEnv(agent: AgentDefinition): NodeJS.ProcessEnv {
  const localKeys = parseLocalEnv(agent.workingDirectory);

  const gatewayFallbacks: Record<string, string> = {};
  for (const key of agent.healthCheck.requiredEnv) {
    if (!(key in localKeys) && process.env[key]) {
      gatewayFallbacks[key] = process.env[key]!;
    }
  }

  return { ...process.env, ...localKeys, ...gatewayFallbacks };
}

// --------------------------------------------------------------------------
// Health check: subprocess agents
// --------------------------------------------------------------------------

async function checkSubprocessAgent(agent: AgentDefinition): Promise<AgentHealthResult> {
  const base: Omit<AgentHealthResult, "status" | "detail"> = {
    agentId: agent.id,
    checkedAt: new Date().toISOString(),
  };

  // 1. Interpreter must exist on disk
  const interpreterPath = agent.interpreterPath;
  if (!interpreterPath || !fs.existsSync(interpreterPath)) {
    return {
      ...base,
      status: "misconfigured",
      detail: `Python interpreter not found: ${interpreterPath ?? "(not set)"}`,
      interpreterFound: false,
    };
  }

  // 2. Working directory must exist
  if (!fs.existsSync(agent.workingDirectory)) {
    return {
      ...base,
      status: "misconfigured",
      detail: `Working directory not found: ${agent.workingDirectory}`,
      interpreterFound: true,
    };
  }

  // 3. Required env keys must be present (local .env or gateway .env)
  const missingEnv = findMissingEnvKeys(agent);
  if (missingEnv.length > 0) {
    return {
      ...base,
      status: "misconfigured",
      detail: `Missing required environment variables: ${missingEnv.join(", ")}`,
      interpreterFound: true,
      missingEnv,
    };
  }

  // 4. Quick interpreter smoke-test: run `python -c "import sys; print(sys.version)"` with a 5s timeout
  try {
    await execFileAsync(interpreterPath, ["-c", "import sys; print(sys.version)"], {
      timeout: 5000,
      cwd: agent.workingDirectory,
    });
    return {
      ...base,
      status: "available",
      detail: "Interpreter reachable, environment configured.",
      interpreterFound: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      status: "unknown",
      detail: `Interpreter check timed out or failed: ${msg}`,
      interpreterFound: true,
    };
  }
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
  const base: Omit<AgentHealthResult, "status" | "detail"> = {
    agentId: agent.id,
    checkedAt: new Date().toISOString(),
  };
  const endpoint = agent.healthCheck.endpoint;
  if (!endpoint) {
    return { ...base, status: "misconfigured", detail: "No health endpoint configured." };
  }
  try {
    const { statusCode, body } = await httpGet(endpoint, 5000);
    if (statusCode === 200) {
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(body) as Record<string, unknown>; } catch { /* not JSON */ }
      if (parsed["status"] === "healthy") {
        return {
          ...base,
          status: "available",
          detail: `HTTP 200 from ${endpoint}. provider=${parsed["provider"] ?? "?"}, model=${parsed["model"] ?? "?"}`,
          endpointReachable: true,
        };
      }
      return {
        ...base,
        status: "unknown",
        detail: `HTTP 200 but unexpected body: ${body.slice(0, 200)}`,
        endpointReachable: true,
      };
    }
    return {
      ...base,
      status: "unavailable",
      detail: `HTTP ${statusCode} from ${endpoint}`,
      endpointReachable: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      status: "unavailable",
      detail: `Connection failed: ${msg}`,
      endpointReachable: false,
    };
  }
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

export const healthService = {
  async checkAgent(agent: AgentDefinition): Promise<AgentHealthResult> {
    if (agent.healthCheck.type === "http") {
      return checkRestAgent(agent);
    }
    return checkSubprocessAgent(agent);
  },

  async checkAll(agents: AgentDefinition[]): Promise<AgentHealthResult[]> {
    return Promise.all(agents.map((a) => this.checkAgent(a)));
  },

  /** Exported for use in execution.service.ts when building spawn env */
  buildSpawnEnv,
  findMissingEnvKeys,
};
