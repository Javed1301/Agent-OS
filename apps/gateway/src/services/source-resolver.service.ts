import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = process.env["WORKSPACE_ROOT"]
  ? path.resolve(process.env["WORKSPACE_ROOT"])
  : path.resolve(__dirname, "../../../..");

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(WORKSPACE_ROOT, "data");

const LOCAL_MAPPINGS_PATH = path.join(DATA_DIR, "registry", "source-mappings.local.json");
const EXAMPLE_MAPPINGS_PATH = path.join(DATA_DIR, "registry", "source-mappings.example.json");
const EXTERNAL_REGISTRY_PATH = path.join(DATA_DIR, "registry", "external-agents.json");

export interface ResolvedSource {
  agentId: string;
  sourceRoot: string;
  entrypoint: string;
  dependencyDescriptor: "requirements.txt" | "pyproject.toml" | "uv.lock" | "none";
  descriptorPath?: string;
}

export const agentSourceResolver = {
  /**
   * Resolve sourceRoot, entrypoint, and dependency details for an agent.
   */
  resolve(agentId: string, manifestWd?: string, manifestEntrypoint?: string): ResolvedSource {
    const startId = agentId;
    // Map aliases
    let resolvedId = agentId;
    if (agentId === "hate-speech-detector") {
      resolvedId = "hate-speech";
    }

    let sourceRoot = "";
    let entrypoint = manifestEntrypoint || resolvedId;

    // 1. Check local source mappings
    let mappings: Record<string, { sourceRoot?: string; entrypoint?: string }> = {};
    if (fs.existsSync(LOCAL_MAPPINGS_PATH)) {
      try {
        mappings = JSON.parse(fs.readFileSync(LOCAL_MAPPINGS_PATH, "utf-8"));
      } catch (err) {
        console.warn(`[source-resolver] Failed to parse local source mappings: ${err}`);
      }
    }

    if (mappings[resolvedId]?.sourceRoot) {
      const candidate = path.resolve(mappings[resolvedId].sourceRoot!);
      if (fs.existsSync(candidate)) {
        sourceRoot = candidate;
        if (mappings[resolvedId].entrypoint) {
          entrypoint = mappings[resolvedId].entrypoint!;
        }
      }
    }

    // 2. Check external-agents.json
    if (!sourceRoot && fs.existsSync(EXTERNAL_REGISTRY_PATH)) {
      try {
        const externalEntries = JSON.parse(fs.readFileSync(EXTERNAL_REGISTRY_PATH, "utf-8")) as Array<{
          id: string;
          path: string;
          originalPath?: string;
        }>;
        const match = externalEntries.find((e) => e.id === resolvedId || e.id === startId);
        if (match) {
          // Try original path first if it exists
          if (match.originalPath && fs.existsSync(match.originalPath)) {
            sourceRoot = path.resolve(match.originalPath);
          } else {
            const relPath = path.resolve(WORKSPACE_ROOT, match.path);
            if (fs.existsSync(relPath)) {
              sourceRoot = relPath;
            }
          }
        }
      } catch (err) {
        console.warn(`[source-resolver] Failed to parse external registry: ${err}`);
      }
    }

    // 3. Check external-agents/<agent-id> folder
    if (!sourceRoot) {
      const externalFolder = path.resolve(WORKSPACE_ROOT, "external-agents", resolvedId);
      if (fs.existsSync(externalFolder)) {
        sourceRoot = externalFolder;
      }
    }

    // 4. Use portable manifest-relative source or manifest workingDirectory
    if (!sourceRoot && manifestWd) {
      const isAbsolute = path.isAbsolute(manifestWd) || /^[a-zA-Z]:[\\/]/.test(manifestWd) || manifestWd.startsWith("/");
      if (isAbsolute) {
        if (fs.existsSync(manifestWd)) {
          sourceRoot = path.resolve(manifestWd);
        }
      } else {
        const relativePath = path.resolve(WORKSPACE_ROOT, manifestWd);
        if (fs.existsSync(relativePath)) {
          sourceRoot = relativePath;
        }
      }
    }

    // 5. Check fallback to default workspace agents directory
    if (!sourceRoot) {
      const defaultWorkspaceAgentDir = path.resolve(WORKSPACE_ROOT, "agents", resolvedId);
      if (fs.existsSync(defaultWorkspaceAgentDir)) {
        sourceRoot = defaultWorkspaceAgentDir;
      }
    }

    // 6. Fail clearly if source cannot be resolved
    if (!sourceRoot) {
      throw new Error(`Unable to resolve sourceRoot for agent ID '${startId}'. Resolved ID: '${resolvedId}'. Checked source mappings, external registry, and manifest directories.`);
    }

    // Determine dependency descriptor inside resolved sourceRoot
    let dependencyDescriptor: ResolvedSource["dependencyDescriptor"] = "none";
    let descriptorPath: string | undefined;

    const uvLock = path.join(sourceRoot, "uv.lock");
    const pyproject = path.join(sourceRoot, "pyproject.toml");
    const reqs = path.join(sourceRoot, "requirements.txt");

    if (fs.existsSync(uvLock)) {
      dependencyDescriptor = "uv.lock";
      descriptorPath = uvLock;
    } else if (fs.existsSync(pyproject)) {
      dependencyDescriptor = "pyproject.toml";
      descriptorPath = pyproject;
    } else if (fs.existsSync(reqs)) {
      dependencyDescriptor = "requirements.txt";
      descriptorPath = reqs;
    }

    // Return resolved details (normalized backslashes for cross-platform consistency)
    return {
      agentId: startId,
      sourceRoot: sourceRoot.replace(/\\/g, "/"),
      entrypoint,
      dependencyDescriptor,
      descriptorPath: descriptorPath ? descriptorPath.replace(/\\/g, "/") : undefined,
    };
  },
};
