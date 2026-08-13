/**
 * AgentDefinition — canonical type for all registered agents.
 * Stored in config/agents.json and served via GET /api/agents.
 */
export type AgentType = "python" | "node" | "cli" | "rest" | "websocket";
export type AgentStatus = "available" | "unavailable" | "misconfigured" | "unknown";
export type IntegrationPhase = 1 | 2;

export interface AgentInputProperty {
  type: "string" | "number" | "boolean";
  description?: string;
  default?: unknown;
  required?: boolean;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  type: AgentType;
  capabilities: string[];
  /** Absolute path to the agent's working directory */
  workingDirectory: string;
  /** For subprocess agents: the agent mode ID passed to runner.py */
  entrypoint: string;
  /** For python agents: absolute path to python.exe in the target venv */
  interpreterPath?: string;
  healthCheck: {
    type: "subprocess" | "http";
    /** For http agents: full URL to health endpoint */
    endpoint?: string;
    /** Keys that must exist (locally or in gateway .env) before marking available */
    requiredEnv: string[];
  };
  inputSchema: {
    type: "object";
    properties: Record<string, AgentInputProperty>;
  };
  /**
   * Relative file paths (relative to workingDirectory) that the agent writes
   * as task outputs. runner.py will move these to the per-execution output dir.
   * Empty/absent for stdout-only agents.
   */
  outputFiles?: string[];
  /**
   * Whether this agent requires a per-working-directory lock before execution.
   * Must be true for any agent writing to fixed-filename output files.
   */
  usesWdLock?: boolean;
  icon?: string;
  phase?: IntegrationPhase;
  /** Adapter-specific configuration (e.g., baseUrl, internalSecret for REST agents) */
  configuration?: Record<string, unknown>;
}

/** Health check result returned by GET /api/agents/:id/health */
export interface AgentHealthResult {
  agentId: string;
  status: AgentStatus;
  checkedAt: string;
  detail?: string;
  missingEnv?: string[];
  interpreterFound?: boolean;
  endpointReachable?: boolean;
}
