/**
 * Runtime Manager Types
 */

export type RuntimeState = "pending" | "building" | "available" | "error" | "stale" | "failed" | "fallback";

export interface RuntimeMetadata {
  hash: string;
  python: string;           // e.g., "3.11"
  pythonShort: string;      // e.g., "py311"
  agents: string[];         // agent IDs associated with this runtime
  agentCount: number;
  sizeBytes: number;
  createdAt: string;
  lastUsedAt: string;
  sourceHash: string;       // SHA256 of the input lock/requirements source
  sourceType: "uv.lock" | "pyproject.toml" | "requirements.txt" | "none";
  state: RuntimeState;
  errorMessage?: string;
  durationMs?: number;
  stdout?: string;
  stderr?: string;
  packageCount?: number;
}

export interface DependencyDetectionResult {
  sourceType: "uv.lock" | "pyproject.toml" | "requirements.txt" | "none";
  sourcePath?: string;
  content: string;
  sourceHash: string;
  pythonVersion: string;
  runtimeHash: string;
  packages: string[];
  filesChecked: {
    "uv.lock": boolean;
    "pyproject.toml": boolean;
    "requirements.txt": boolean;
  };
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
