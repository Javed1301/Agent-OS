/**
 * Registry Service — YAML-based agent discovery.
 *
 * Scans agents/<id>/agent.yaml files relative to the workspace root.
 * Also merges external agents from data/registry/external-agents.json.
 * Auto-resolves Python interpreter path from the agent's working directory.
 * Provides in-memory registry with list/get/reload operations.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import type { AgentDefinition, AgentInputProperty } from "../types/agent.js";
import { secretsService } from "./secrets.service.js";

import { runtimeService } from "./runtime.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Workspace root override for Docker or 4 levels up from apps/gateway/src/services/
const WORKSPACE_ROOT = process.env["WORKSPACE_ROOT"]
  ? path.resolve(process.env["WORKSPACE_ROOT"])
  : path.resolve(__dirname, "../../../..");
const AGENTS_DIR = path.join(WORKSPACE_ROOT, "agents");
const EXTERNAL_AGENTS_DIR = path.join(WORKSPACE_ROOT, "external-agents");
const EXTERNAL_REGISTRY_PATH = path.join(WORKSPACE_ROOT, "data", "registry", "external-agents.json");

// ---------------------------------------------------------------------------
// Path utilities & normalization
// ---------------------------------------------------------------------------

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

function isAbsolutePath(p: string): boolean {
  return path.isAbsolute(p) || /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("/");
}

// ---------------------------------------------------------------------------
// Python interpreter auto-resolution
// ---------------------------------------------------------------------------

const INTERPRETER_CANDIDATES = [
  ".venv311/Scripts/python.exe",
  ".venv311/bin/python",
  ".venv/Scripts/python.exe",
  ".venv/bin/python",
  "venv/Scripts/python.exe",
  "venv/bin/python",
];

const LINUX_FALLBACKS = [
  "/usr/local/bin/python3",
  "/usr/local/bin/python",
  "/usr/bin/python3",
  "/usr/bin/python",
  "python3",
  "python",
];

/**
 * Resolve the Python interpreter for a given working directory.
 * First checks managed uv runtimes, then walks UP local directory tree.
 */
function resolveInterpreter(workingDirectory: string, agentId?: string): string {
  // Check managed runtimes first
  try {
    const depInfo = runtimeService.detectDependencies(workingDirectory);
    if (depInfo.runtimeHash && depInfo.runtimeHash !== "none") {
      const meta = runtimeService.getMetadata(depInfo.runtimeHash);
      if (meta && meta.state === "available") {
        const runtimeDir = runtimeService.getRuntimeDir(depInfo.runtimeHash, meta.pythonShort);
        const venvDir = path.join(runtimeDir, ".venv");
        const winPath = path.join(venvDir, "Scripts", "python.exe");
        const nixPath = path.join(venvDir, "bin", "python");

        const targetPath = process.platform === "win32"
          ? (fs.existsSync(winPath) ? winPath : nixPath)
          : (fs.existsSync(nixPath) ? nixPath : winPath);

        if (fs.existsSync(targetPath)) {
          if (agentId) {
            runtimeService.associateAgent(depInfo.runtimeHash, agentId);
          }
          return targetPath;
        }
      }
    }
  } catch {
    /* ignore fallback to walkup */
  }

  let current = workingDirectory;
  while (true) {
    for (const candidate of INTERPRETER_CANDIDATES) {
      const resolved = path.join(current, candidate);
      if (fs.existsSync(resolved)) {
        return resolved;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break; // reached filesystem root
    current = parent;
  }

  // Linux fallbacks in precedence order
  for (const fallback of LINUX_FALLBACKS) {
    if (fallback.startsWith("/")) {
      if (fs.existsSync(fallback)) {
        return fallback;
      }
    } else {
      return fallback;
    }
  }

  return "python";
}

// ---------------------------------------------------------------------------
// External agents JSON structure
// ---------------------------------------------------------------------------

interface ExternalAgentEntry {
  id: string;
  path: string;
  originalPath?: string;
}

function readExternalRegistry(): ExternalAgentEntry[] {
  try {
    if (!fs.existsSync(EXTERNAL_REGISTRY_PATH)) return [];
    const raw = fs.readFileSync(EXTERNAL_REGISTRY_PATH, "utf-8");
    return JSON.parse(raw) as ExternalAgentEntry[];
  } catch (err) {
    console.warn(`[registry] Failed to read external agents registry: ${err}`);
    return [];
  }
}

function writeExternalRegistry(entries: ExternalAgentEntry[]): void {
  const dir = path.dirname(EXTERNAL_REGISTRY_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(EXTERNAL_REGISTRY_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

function copyFolderRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "__pycache__") {
      continue;
    }
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyFolderRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Raw YAML manifest shape (what we read from agent.yaml)
// ---------------------------------------------------------------------------

interface AgentYamlManifest {
  id: string;
  name: string;
  description?: string;
  category?: string;
  type?: string;
  version?: string;
  capabilities?: string[];
  workingDirectory: string;
  entrypoint: string;
  source?: "workspace" | "imported";
  originalPath?: string;
  secrets?: {
    required?: string[];
    optional?: string[];
  };
  env?: Record<string, string>;
  icon?: string;
  phase?: number;
  usesWdLock?: boolean;
  outputFiles?: string[];
  inputs?: Record<string, {
    type: string;
    required?: boolean;
    description?: string;
    default?: unknown;
  }>;
  outputs?: Record<string, { type?: string }>;
  healthcheck?: {
    type?: string;
    endpoint?: string;
    requiredEnv?: string[];
    command?: string;
  };
  configuration?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// YAML -> AgentDefinition conversion
// ---------------------------------------------------------------------------

function manifestToDefinition(
  manifest: AgentYamlManifest,
  manifestPath: string,
  isExternal = false,
  externalPath?: string,
  overrideOriginalPath?: string
): AgentDefinition {
  const agentType = (manifest.type ?? "python") as AgentDefinition["type"];

  // Build inputSchema from inputs map
  const inputProperties: Record<string, AgentInputProperty> = {};
  if (manifest.inputs) {
    for (const [key, val] of Object.entries(manifest.inputs)) {
      inputProperties[key] = {
        type: (val.type ?? "string") as AgentInputProperty["type"],
        required: val.required,
        description: val.description,
        default: val.default,
      };
    }
  }

  const rawWd = manifest.workingDirectory || "";
  const isAbsolute = isAbsolutePath(rawWd);
  let logicalPath = normalizePath(rawWd);
  let resolvedPath: string;
  let isDockerCompatible = !isAbsolute;

  if (isAbsolute) {
    console.warn(
      `[registry] WARNING: Agent '${manifest.id}' manifest contains non-portable host absolute path: '${rawWd}'.`
    );
    resolvedPath = path.resolve(rawWd);
  } else {
    // Relative path resolves against WORKSPACE_ROOT
    resolvedPath = path.resolve(WORKSPACE_ROOT, rawWd);
  }

  // Parse secret declarations & migrate legacy env/requiredEnv
  const requiredSecrets = [
    ...(manifest.secrets?.required || []),
    ...(manifest.healthcheck?.requiredEnv || []),
    ...(manifest.env ? Object.keys(manifest.env) : []),
  ];
  const uniqueRequired = Array.from(new Set(requiredSecrets));
  const uniqueOptional = Array.from(new Set(manifest.secrets?.optional || []));

  if (manifest.env || (manifest.healthcheck?.requiredEnv && manifest.healthcheck.requiredEnv.length > 0 && !manifest.secrets)) {
    console.warn(`[registry] Migrated legacy env/requiredEnv for agent '${manifest.id}' to secrets.required.`);
  }

  // Determine source classification
  const source: AgentDefinition["source"] =
    manifest.source ?? (isExternal || logicalPath.startsWith("external-agents/") || manifest.originalPath || overrideOriginalPath ? "imported" : "workspace");

  const originalPath = overrideOriginalPath || manifest.originalPath || externalPath || (source === "imported" ? resolvedPath : undefined);
  const containerPath = resolvedPath;

  // Detect runtime dependency information
  let runtimeConfig: AgentDefinition["runtime"] = undefined;
  if (agentType === "python") {
    try {
      const depInfo = runtimeService.detectDependencies(resolvedPath);
      if (depInfo.sourceType !== "none") {
        runtimeConfig = {
          python: depInfo.pythonVersion,
          resolver: "uv",
          dependencies: {
            file: depInfo.sourceType,
          },
          hash: depInfo.runtimeHash,
        };
      }
    } catch {
      /* ignore */
    }
  }

  // Auto-resolve interpreter for python agents using resolvedPath
  let interpreterPath: string | undefined;
  if (agentType === "python") {
    interpreterPath = resolveInterpreter(resolvedPath, manifest.id);
  }

  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description ?? "",
    category: manifest.category ?? "General",
    type: agentType,
    version: manifest.version ?? "1.0.0",
    capabilities: manifest.capabilities ?? [],
    workingDirectory: resolvedPath,
    entrypoint: manifest.entrypoint,
    source,
    logicalPath,
    originalPath: originalPath ? normalizePath(originalPath) : undefined,
    containerPath: normalizePath(containerPath),
    resolvedPath: normalizePath(resolvedPath),
    isDockerCompatible,
    secrets: {
      required: uniqueRequired,
      optional: uniqueOptional,
    },
    runtime: runtimeConfig,
    interpreterPath,
    healthCheck: {
      type: (manifest.healthcheck?.type ?? "subprocess") as "subprocess" | "http",
      endpoint: manifest.healthcheck?.endpoint,
      requiredEnv: uniqueRequired,
    },
    inputSchema: {
      type: "object",
      properties: inputProperties,
    },
    outputFiles: manifest.outputFiles ?? [],
    usesWdLock: manifest.usesWdLock ?? false,
    icon: manifest.icon,
    phase: manifest.phase as AgentDefinition["phase"],
    configuration: manifest.configuration,
    isExternal: isExternal || source === "imported",
    externalPath: externalPath ? normalizePath(externalPath) : logicalPath,
  };
}

// ---------------------------------------------------------------------------
// In-memory registry
// ---------------------------------------------------------------------------

let _agents: AgentDefinition[] = [];
let _loaded = false;

/**
 * Load agents from workspace agents/ directory.
 */
function loadWorkspaceAgents(): AgentDefinition[] {
  const discovered: AgentDefinition[] = [];

  if (!fs.existsSync(AGENTS_DIR)) {
    console.warn(`[registry] agents/ directory not found at: ${AGENTS_DIR}`);
    return discovered;
  }

  const entries = fs.readdirSync(AGENTS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const manifestPath = path.join(AGENTS_DIR, entry.name, "agent.yaml");
    if (!fs.existsSync(manifestPath)) continue;

    try {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const manifest = yaml.load(raw) as AgentYamlManifest;

      if (!manifest.id || !manifest.name || !manifest.workingDirectory || !manifest.entrypoint) {
        console.warn(`[registry] Skipping ${manifestPath}: missing required fields`);
        continue;
      }

      const definition = manifestToDefinition(manifest, manifestPath, false);
      discovered.push(definition);
      console.log(`[registry] Loaded workspace agent: ${definition.id} (${definition.type}) -> ${definition.logicalPath}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[registry] Failed to load ${manifestPath}: ${msg}`);
    }
  }

  return discovered;
}

/**
 * Load agents from external-agents/ directory and external-agents.json.
 */
function loadExternalAgents(): AgentDefinition[] {
  const discovered: AgentDefinition[] = [];
  const entries = readExternalRegistry();

  for (const entry of entries) {
    const entryPath = isAbsolutePath(entry.path)
      ? entry.path
      : path.resolve(WORKSPACE_ROOT, entry.path);

    const manifestPath = path.join(entryPath, "agent.yaml");
    if (!fs.existsSync(manifestPath)) {
      console.warn(`[registry] External agent '${entry.id}' manifest missing at: ${manifestPath}`);
      continue;
    }

    try {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const manifest = yaml.load(raw) as AgentYamlManifest;

      if (!manifest.id || !manifest.name || !manifest.entrypoint) {
        console.warn(`[registry] Skipping external ${manifestPath}: missing required fields`);
        continue;
      }

      const definition = manifestToDefinition(manifest, manifestPath, true, entry.path, entry.originalPath);
      discovered.push(definition);
      console.log(`[registry] Loaded external agent: ${definition.id} from ${definition.logicalPath} (originalPath: ${definition.originalPath})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[registry] Failed to load external agent ${entry.path}: ${msg}`);
    }
  }

  return discovered;
}

let _duplicateIds: string[] = [];

function loadAllAgents(): AgentDefinition[] {
  const workspace = loadWorkspaceAgents();
  const external = loadExternalAgents();

  _duplicateIds = [];

  // MERGE RULE: External / imported agents take precedence over workspace stub manifests
  const externalIds = new Set(external.map((a) => a.id));
  const merged: AgentDefinition[] = [...external];

  for (const agent of workspace) {
    if (!externalIds.has(agent.id)) {
      merged.push(agent);
    } else {
      if (!_duplicateIds.includes(agent.id)) {
        _duplicateIds.push(agent.id);
      }
      console.warn(`[registry] WARNING: Imported external agent '${agent.id}' overrides workspace stub manifest. Active manifest: imported.`);
    }
  }

  return merged;
}

function ensureLoaded(): void {
  if (!_loaded) {
    _agents = loadAllAgents();
    _loaded = true;
    console.log(`[registry] Discovered ${_agents.length} agents total (workspace + external)`);
  }
}

// ---------------------------------------------------------------------------
// Public registry API
// ---------------------------------------------------------------------------

export const registryService = {
  /** Discover and load all agents from workspace agents/ + external-agents/ */
  load(): void {
    _agents = loadAllAgents();
    _loaded = true;
    console.log(`[registry] Loaded ${_agents.length} agents`);
  },

  /** Force re-scan of all agent sources */
  reload(): void {
    _loaded = false;
    ensureLoaded();
  },

  getDuplicateIds(): string[] {
    ensureLoaded();
    return [..._duplicateIds];
  },

  /** Return all registered agents with auto-resolved interpreter paths */
  listAgents(): AgentDefinition[] {
    ensureLoaded();
    return [..._agents];
  },

  getAgent(id: string): AgentDefinition | undefined {
    ensureLoaded();
    return _agents.find((a) => a.id === id);
  },

  /**
   * Product-Grade Import System:
   * Imports an external agent from any folder path on disk,
   * copies the files into external-agents/<agent-id>/,
   * updates the manifest workingDirectory to external-agents/<agent-id>,
   * and registers it with workspace-relative paths.
   */
  importAgent(sourceFolderPath: string): {
    success: boolean;
    agent?: AgentDefinition;
    error?: string;
    missingRequiredSecrets?: string[];
    missingOptionalSecrets?: string[];
  } {
    ensureLoaded();

    if (!fs.existsSync(sourceFolderPath)) {
      return { success: false, error: `Source folder not found: ${sourceFolderPath}` };
    }

    const sourceManifestPath = path.join(sourceFolderPath, "agent.yaml");
    if (!fs.existsSync(sourceManifestPath)) {
      return { success: false, error: `No agent.yaml found in source folder: ${sourceFolderPath}` };
    }

    let manifest: AgentYamlManifest;
    try {
      const raw = fs.readFileSync(sourceManifestPath, "utf-8");
      manifest = yaml.load(raw) as AgentYamlManifest;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Failed to parse agent.yaml: ${msg}` };
    }

    if (!manifest.id || !manifest.name || !manifest.entrypoint) {
      return {
        success: false,
        error: "agent.yaml is missing required fields: id, name, entrypoint",
      };
    }

    const allowOverride = process.env["AGENT_IMPORT_OVERRIDE"] === "true";
    const existing = this.getAgent(manifest.id);
    if (existing && existing.source === "imported" && !allowOverride) {
      return {
        success: false,
        error: `Agent ID '${manifest.id}' already exists in registry. Set AGENT_IMPORT_OVERRIDE=true to force overwrite.`,
      };
    }

    const targetDir = path.join(EXTERNAL_AGENTS_DIR, manifest.id);
    const relativeTargetWd = `external-agents/${manifest.id}`;
    const absOriginalPath = normalizePath(path.resolve(sourceFolderPath));

    // Copy agent files to external-agents/<id>/
    try {
      copyFolderRecursive(sourceFolderPath, targetDir);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Failed to copy agent files to workspace: ${msg}` };
    }

    // Rewrite agent.yaml in targetDir to use portable relative path
    const targetManifestPath = path.join(targetDir, "agent.yaml");
    manifest.source = "imported";
    manifest.originalPath = absOriginalPath;
    manifest.workingDirectory = relativeTargetWd;
    fs.writeFileSync(targetManifestPath, yaml.dump(manifest, { lineWidth: -1 }), "utf-8");

    // Build definition
    const definition = manifestToDefinition(manifest, targetManifestPath, true, relativeTargetWd, absOriginalPath);

    // Persist relative path in external-agents.json
    const entries = readExternalRegistry();
    const filtered = entries.filter((e) => e.id !== definition.id);
    filtered.push({ id: definition.id, path: relativeTargetWd, originalPath: absOriginalPath });
    writeExternalRegistry(filtered);

    // Check required/optional secrets against vault
    const requiredKeys = definition.secrets?.required || [];
    const optionalKeys = definition.secrets?.optional || [];
    const missingRequiredSecrets = requiredKeys.filter((k) => !secretsService.getSecret(k));
    const missingOptionalSecrets = optionalKeys.filter((k) => !secretsService.getSecret(k));

    // Reload registry
    this.reload();

    console.log(`[registry] Successfully imported agent '${definition.id}' to '${relativeTargetWd}' (Missing required secrets: ${missingRequiredSecrets.length})`);
    return {
      success: true,
      agent: this.getAgent(definition.id) || definition,
      missingRequiredSecrets,
      missingOptionalSecrets,
    };
  },

  /** Alias for backward compatibility */
  registerExternal(folderPath: string): { success: boolean; agent?: AgentDefinition; error?: string } {
    return this.importAgent(folderPath);
  },

  /** List all external agent entries (id + path) from external-agents.json */
  listExternalEntries(): Array<{ id: string; path: string }> {
    return readExternalRegistry();
  },

  /** Resolve the interpreter path for an agent */
  resolveInterpreter,
};

