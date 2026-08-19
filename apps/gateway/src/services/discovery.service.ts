import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { getRuntimeStorageRoot } from "./runtime.service.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WORKSPACE_ROOT = process.env["WORKSPACE_ROOT"]
  ? path.resolve(process.env["WORKSPACE_ROOT"])
  : path.resolve(__dirname, "../../../..");

export interface PythonEnvironment {
  id: string;
  type: "system" | "venv" | "conda" | "uv" | "managed";
  pythonVersion: string; // e.g. "3.11.15"
  executablePath: string;
  environmentRoot?: string;
  sourceProject?: string;
  platform: string;
  architecture?: string;
  packages?: Record<string, string>; // normalizedPackageName -> version
  discoveredFrom: string;
}

// Memory cache for python environment package listings to ensure high performance
interface CachedMeta {
  pythonVersion: string;
  packages: Record<string, string>;
  mtime: number;
}
const envMetadataCache = new Map<string, CachedMeta>();

// Cache for system python binaries to avoid duplicate subprocess lookups
let systemBinariesCache: string[] | null = null;

export const environmentDiscoveryService = {
  /**
   * Discovers Python environments on the host machine.
   */
  async discover(sourceRoot?: string): Promise<PythonEnvironment[]> {
    const candidates = new Map<string, { type: PythonEnvironment["type"]; discoveredFrom: string; envRoot?: string }>();
    const isWindows = process.platform === "win32";

    // helper to add binary
    const addCandidate = (execPath: string, type: PythonEnvironment["type"], discoveredFrom: string, envRoot?: string) => {
      if (!execPath) return;
      const normalized = path.resolve(execPath).replace(/\\/g, "/");
      if (fs.existsSync(normalized) && !candidates.has(normalized)) {
        candidates.set(normalized, { type, discoveredFrom, envRoot: envRoot?.replace(/\\/g, "/") });
      }
    };

    // 1. Explicitly configured interpreters or environment variables
    if (process.env["PYTHON_PATH"]) {
      addCandidate(process.env["PYTHON_PATH"], "system", "PYTHON_PATH Env Var");
    }

    // 2. Project-local virtualenvs inside sourceRoot
    if (sourceRoot && fs.existsSync(sourceRoot)) {
      const venvSubdirs = [".venv311", ".venv", "venv"];
      for (const s of venvSubdirs) {
        const envRoot = path.join(sourceRoot, s);
        const winBin = path.join(envRoot, "Scripts", "python.exe");
        const nixBin = path.join(envRoot, "bin", "python");
        addCandidate(isWindows ? winBin : nixBin, "venv", `Project Local: ${s}`, envRoot);
        addCandidate(winBin, "venv", `Project Local (Win fallback): ${s}`, envRoot);
        addCandidate(nixBin, "venv", `Project Local (Nix fallback): ${s}`, envRoot);
      }

      // 3. Parent project environments (walk up tree from sourceRoot)
      let current = path.resolve(sourceRoot);
      while (true) {
        for (const s of venvSubdirs) {
          const envRoot = path.join(current, s);
          const winBin = path.join(envRoot, "Scripts", "python.exe");
          const nixBin = path.join(envRoot, "bin", "python");
          addCandidate(isWindows ? winBin : nixBin, "venv", `Parent Project Local: ${s}`, envRoot);
          addCandidate(winBin, "venv", `Parent Project Local (Win fallback): ${s}`, envRoot);
          addCandidate(nixBin, "venv", `Parent Project Local (Nix fallback): ${s}`, envRoot);
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
    }

    // 4. Conda environments
    if (process.env["CONDA_PREFIX"]) {
      const condaRoot = process.env["CONDA_PREFIX"];
      const winBin = path.join(condaRoot, "python.exe");
      const nixBin = path.join(condaRoot, "bin", "python");
      addCandidate(isWindows ? winBin : nixBin, "conda", "CONDA_PREFIX Env Var", condaRoot);
      addCandidate(winBin, "conda", "CONDA_PREFIX (Win fallback)", condaRoot);
      addCandidate(nixBin, "conda", "CONDA_PREFIX (Nix fallback)", condaRoot);
    }

    // Standard Conda paths
    const homeDir = os.homedir();
    const condaPaths = [
      path.join(homeDir, "miniconda3"),
      path.join(homeDir, "anaconda3"),
      path.join(homeDir, "AppData", "Local", "miniconda3"),
      path.join(homeDir, "AppData", "Local", "anaconda3"),
      "C:\\ProgramData\\miniconda3",
      "C:\\ProgramData\\anaconda3",
    ];
    for (const cp of condaPaths) {
      if (fs.existsSync(cp)) {
        const winBin = path.join(cp, "python.exe");
        const nixBin = path.join(cp, "bin", "python");
        addCandidate(isWindows ? winBin : nixBin, "conda", "Standard Conda Dir", cp);
        addCandidate(winBin, "conda", "Standard Conda Dir (Win)", cp);
        addCandidate(nixBin, "conda", "Standard Conda Dir (Nix)", cp);

        // Scan envs subdirectory
        const envsDir = path.join(cp, "envs");
        if (fs.existsSync(envsDir)) {
          try {
            const subenvs = fs.readdirSync(envsDir, { withFileTypes: true });
            for (const se of subenvs) {
              if (se.isDirectory()) {
                const subRoot = path.join(envsDir, se.name);
                const winSubBin = path.join(subRoot, "python.exe");
                const nixSubBin = path.join(subRoot, "bin", "python");
                addCandidate(isWindows ? winSubBin : nixSubBin, "conda", `Conda Env: ${se.name}`, subRoot);
                addCandidate(winSubBin, "conda", `Conda Env (Win): ${se.name}`, subRoot);
                addCandidate(nixSubBin, "conda", `Conda Env (Nix): ${se.name}`, subRoot);
              }
            }
          } catch { /* ignore */ }
        }
      }
    }

    // 5. Existing Agent OS managed runtimes
    const storageRoot = getRuntimeStorageRoot();
    if (fs.existsSync(storageRoot)) {
      try {
        const pyShorts = fs.readdirSync(storageRoot, { withFileTypes: true });
        for (const pyShort of pyShorts) {
          if (!pyShort.isDirectory()) continue;
          const pyPath = path.join(storageRoot, pyShort.name);
          const hashes = fs.readdirSync(pyPath, { withFileTypes: true });
          for (const hash of hashes) {
            if (!hash.isDirectory()) continue;
            const envRoot = path.join(pyPath, hash.name, ".venv");
            const winBin = path.join(envRoot, "Scripts", "python.exe");
            const nixBin = path.join(envRoot, "bin", "python");
            addCandidate(isWindows ? winBin : nixBin, "managed", `Managed Runtime: ${hash.name}`, envRoot);
            addCandidate(winBin, "managed", `Managed Runtime (Win): ${hash.name}`, envRoot);
            addCandidate(nixBin, "managed", `Managed Runtime (Nix): ${hash.name}`, envRoot);
          }
        }
      } catch { /* ignore */ }
    }

    // 6. System CPython fallback (using cached binaries to avoid duplicate lookups)
    if (systemBinariesCache === null) {
      systemBinariesCache = [];
      const systemPythons = ["python", "python3", "python3.11", "python3.13"];
      for (const sp of systemPythons) {
        try {
          const cmd = isWindows ? "where" : "which";
          const { stdout } = await execFileAsync(cmd, [sp]);
          const lines = stdout.split("\r\n").flatMap((l) => l.split("\n")).map((l) => l.trim()).filter(Boolean);
          for (const line of lines) {
            const normalized = path.resolve(line).replace(/\\/g, "/");
            if (fs.existsSync(normalized) && !systemBinariesCache.includes(normalized)) {
              systemBinariesCache.push(normalized);
            }
          }
        } catch { /* ignore */ }
      }
    }

    for (const binaryPath of systemBinariesCache) {
      addCandidate(binaryPath, "system", "System Path");
    }

    // Standard Windows CPython installation path
    const winCPythonRoot = "C:\\Program Files\\Python313";
    if (fs.existsSync(winCPythonRoot)) {
      addCandidate(path.join(winCPythonRoot, "python.exe"), "system", "Standard Windows CPython");
    }

    // Build the PythonEnvironment array by querying metadata
    const environments: PythonEnvironment[] = [];
    let count = 0;

    for (const [execPath, info] of candidates.entries()) {
      try {
        const meta = await this.getEnvironmentMetadata(execPath);
        if (meta) {
          count++;
          environments.push({
            id: `ENV-${info.type.toUpperCase()}-${count}`,
            type: info.type,
            pythonVersion: meta.pythonVersion,
            executablePath: execPath,
            environmentRoot: info.envRoot,
            platform: process.platform,
            architecture: process.arch,
            packages: meta.packages,
            discoveredFrom: info.discoveredFrom,
          });
        }
      } catch (err) {
        console.warn(`[discovery] Failed to query Python environment metadata for '${execPath}': ${err}`);
      }
    }

    return environments;
  },

  /**
   * Queries Python version and packages from an environment's interpreter.
   */
  async getEnvironmentMetadata(execPath: string): Promise<{ pythonVersion: string; packages: Record<string, string> } | null> {
    try {
      let stats: fs.Stats | null = null;
      try {
        stats = fs.statSync(execPath);
      } catch {
        return null;
      }

      // Check cache validity
      const cached = envMetadataCache.get(execPath);
      if (cached && cached.mtime === stats.mtimeMs) {
        return {
          pythonVersion: cached.pythonVersion,
          packages: cached.packages,
        };
      }

      // Query interpreter directly
      const pythonCode = `
import sys, json
try:
    import importlib.metadata as m
    dists = {p.metadata['Name'].lower().replace('-', '_'): p.version for p in m.distributions() if p.metadata and p.metadata['Name']}
except ImportError:
    try:
        import pkg_resources
        dists = {p.project_name.lower().replace('-', '_'): p.version for p in pkg_resources.working_set}
    except Exception:
        dists = {}
info = {
    "version": ".".join(map(str, sys.version_info[:3])),
    "packages": dists
}
print(json.dumps(info))
`;

      const { stdout } = await execFileAsync(execPath, ["-c", pythonCode.trim()], { timeout: 4000 });
      const result = JSON.parse(stdout.trim()) as { version: string; packages: Record<string, string> };

      // Save cache
      envMetadataCache.set(execPath, {
        pythonVersion: result.version,
        packages: result.packages,
        mtime: stats.mtimeMs,
      });

      return {
        pythonVersion: result.version,
        packages: result.packages,
      };
    } catch {
      return null;
    }
  },
};
