export type AgentType = "python" | "node" | "cli" | "rest" | "websocket";
export type AgentStatus = "available" | "warning" | "unavailable" | "unknown";
export type AgentSource = "workspace" | "imported";

export interface AgentInputProperty {
  type: "string" | "number" | "boolean";
  description?: string;
  default?: unknown;
  required?: boolean;
}

export interface AgentHealthCheckConfig {
  type: "subprocess" | "http";
  endpoint?: string;
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

export type RuntimeState = "pending" | "building" | "available" | "error" | "stale" | "failed" | "fallback";

export interface RuntimeMetadata {
  hash: string;
  python: string;
  pythonShort: string;
  agents: string[];
  agentCount: number;
  sizeBytes: number;
  createdAt: string;
  lastUsedAt: string;
  sourceHash: string;
  sourceType: "uv.lock" | "pyproject.toml" | "requirements.txt" | "none";
  state: RuntimeState;
  errorMessage?: string;
  durationMs?: number;
  stdout?: string;
  stderr?: string;
  packageCount?: number;
}

export interface RuntimeResolveResult {
  hash: string;
  reuseExisting: boolean;
  state: RuntimeState;
  interpreterPath: string;
  installedPackageCount?: number;
  elapsedMs: number;
  message?: string;
}

export interface GCResult {
  deleted: string[];
  retained: string[];
  freedBytes: number;
  reasons: Record<string, string>;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  type: AgentType;
  version?: string;
  capabilities: string[];
  workingDirectory: string;
  entrypoint: string;
  source?: AgentSource;
  logicalPath?: string;
  originalPath?: string;
  containerPath?: string;
  resolvedPath?: string;
  isDockerCompatible?: boolean;
  secrets?: AgentSecretsConfig;
  runtime?: AgentRuntimeConfig;
  interpreterPath?: string;
  healthCheck: AgentHealthCheckConfig;
  inputSchema: {
    type: "object";
    properties: Record<string, AgentInputProperty>;
  };
  outputFiles?: string[];
  usesWdLock?: boolean;
  icon?: string;
  phase?: number;
  configuration?: Record<string, unknown>;
  /** True if this agent was imported from an external folder path */
  isExternal?: boolean;
  /** Original folder path for external agents */
  externalPath?: string;
}

export interface HealthCheckItem {
  label: string;
  status: "pass" | "fail" | "warn";
  detail: string;
}

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
  checks?: HealthCheckItem[];
}

export type ExecutionStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout";

export interface ExecutionRecord {
  id: string;
  agentId: string;
  input: Record<string, unknown>;
  status: ExecutionStatus;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  runDir: string;
  logPath: string;
  outputFiles?: Record<string, string>;
  result?: unknown;
  error?: string;
  exitCode?: number;
}

export interface ExecutionIndexEntry {
  id: string;
  agentId: string;
  status: ExecutionStatus;
  startTime: string;
  endTime?: string;
  durationMs?: number;
}

export interface WorkflowStep {
  id: string;
  agent: string;
  input: Record<string, unknown>;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  steps: WorkflowStep[];
}

export interface StepRunRecord {
  stepId: string;
  executionId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  startTime?: string;
  endTime?: string;
  error?: string;
}

export interface WorkflowRunRecord {
  id: string;
  workflowId: string;
  input: Record<string, unknown>;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  startTime: string;
  endTime?: string;
  durationMs?: number;
  steps: StepRunRecord[];
  error?: string;
}

export interface Artifact {
  path: string;
  name: string;
  sizeBytes?: number;
}

export interface SettingsState {
  displayName: string;
  email: string;
  workspaceName: string;
  timezone: string;
  theme: "dark" | "night";
  accent: "gold" | "violet";
  digestEmail: boolean;
  pushAlerts: boolean;
  incidentOnly: boolean;
  apiKey: string;
  runtimeRegion: "us-east-1" | "eu-west-1";
}

export interface Metric {
  id: string;
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "neutral";
}

export interface ActivityItem {
  id: string;
  title: string;
  detail: string;
  time: string;
  status: "success" | "warning" | "error" | "info";
}
