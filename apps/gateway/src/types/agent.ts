/**
 * AgentDefinition — canonical type for all registered agents.
 * Loaded from agents/<id>/agent.yaml by the registry.
 */
export type AgentType = "python" | "node" | "cli" | "rest" | "websocket";
export type AgentStatus = "available" | "warning" | "unavailable" | "unknown";
export type AgentSource = "workspace" | "imported";
export type IntegrationPhase = 1 | 2;

export interface AgentInputProperty {
  type: "string" | "number" | "boolean";
  description?: string;
  default?: unknown;
  required?: boolean;
}

export interface AgentHealthCheckConfig {
  type: "subprocess" | "http";
  /** For http agents: full URL to health endpoint */
  endpoint?: string;
  /** Env keys that must exist before marking available */
  requiredEnv?: string[];
}

export interface AgentSecretsConfig {
  required?: string[];
  optional?: string[];
}

export interface AgentRuntimeConfig {
  python?: string;
  resolver?: "uv" | "pip";
  dependencies?: {
    file?: string;
  };
  hash?: string;
}

export interface AgentDefinition {
  id: string;
  canonicalId?: string;
  name: string;
  description: string;
  category: string;
  type: AgentType;
  version?: string;
  capabilities: string[];
  /** Relative path to the agent's working directory from WORKSPACE_ROOT */
  workingDirectory: string;
  /** For subprocess agents: the agent mode ID passed to runner.py */
  entrypoint: string;
  /** Source classification: "workspace" or "imported" */
  source?: AgentSource;
  /** Logical path relative to workspace (e.g. external-agents/hate-speech) */
  logicalPath?: string;
  /** Original host path from where agent was imported */
  originalPath?: string;
  /** Resolved container path inside Docker or host environment */
  containerPath?: string;
  /** Absolute resolved path on local host/container */
  resolvedPath?: string;
  /** True if workingDirectory is relative and Docker/git portable */
  isDockerCompatible?: boolean;
  /** Secret declarations (required & optional keys) */
  secrets?: AgentSecretsConfig;
  /** Runtime configuration & fingerprint */
  runtime?: AgentRuntimeConfig;
  /**
   * Auto-resolved at runtime — NOT stored in agent.yaml.
   * Resolved by checking managed runtimes, .venv311, .venv, venv, then system python.
   */
  interpreterPath?: string;
  healthCheck: AgentHealthCheckConfig;
  inputSchema: {
    type: "object";
    properties: Record<string, AgentInputProperty>;
  };
  /**
   * Relative file paths (relative to workingDirectory) that the agent writes
   * as task outputs. runner.py will move these to the per-execution output dir.
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
  /** True if this agent was imported from an external folder path (not in workspace agents/) */
  isExternal?: boolean;
  /** Original folder path for external agents */
  externalPath?: string;
}

/** A single structured health check item */
export interface HealthCheckItem {
  label: string;
  status: "pass" | "fail" | "warn";
  detail: string;
}

/** Health check result returned by GET /api/agents/:id/health */
export interface AgentHealthResult {
  agentId: string;
  status: AgentStatus;
  checkedAt: string;
  detail?: string;
  logicalPath?: string;
  resolvedPath?: string;
  isDockerCompatible?: boolean;
  missingEnv?: string[];
  missingRequiredSecrets?: string[];
  missingOptionalSecrets?: string[];
  interpreterFound?: boolean;
  interpreterPath?: string;
  endpointReachable?: boolean;
  configuredEndpoint?: string;
  effectiveEndpoint?: string;
  runtimeHash?: string;
  runtimeState?: string;
  runtimeBadgeStatus?: "managed" | "fallback" | "stale" | "building" | "failed";
  isStale?: boolean;
  filesChecked?: {
    "uv.lock": boolean;
    "pyproject.toml": boolean;
    "requirements.txt": boolean;
  };
  /** Structured list of individual health check results */
  checks?: HealthCheckItem[];
}
