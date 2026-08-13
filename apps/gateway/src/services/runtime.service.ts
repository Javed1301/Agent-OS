/**
 * Runtime Service — uv-Based Python Runtime Manager
 *
 * Manages isolated, content-addressed Python runtimes using Astral's uv package manager.
 * Runtimes are shared across agents with identical resolved dependencies.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import os from "node:os";
import type {
  RuntimeMetadata,
  DependencyDetectionResult,
  RuntimeResolveResult,
  GCResult,
  RuntimeState,
} from "../types/runtime.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WORKSPACE_ROOT = process.env["WORKSPACE_ROOT"]
  ? path.resolve(process.env["WORKSPACE_ROOT"])
  : path.resolve(__dirname, "../../../..");

export function getRuntimeStorageRoot(): string {
  const isDocker = process.env["DOCKER_ENV"] === "true" || fs.existsSync("/.dockerenv");
  if (isDocker) {
    return "/app/runtimes";
  }
  return process.env["RUNTIMES_DIR"] || path.join(os.homedir(), ".agent-os", "runtimes");
}

export function getUvCacheRoot(): string {
  const isDocker = process.env["DOCKER_ENV"] === "true" || fs.existsSync("/.dockerenv");
  if (isDocker) {
    return "/root/.cache/uv";
  }
  return process.env["UV_CACHE_DIR"] || path.join(os.homedir(), ".agent-os", "uv-cache");
}

const RUNTIMES_DIR = getRuntimeStorageRoot();
const BUILD_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getDirectorySize(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  let totalSize = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        totalSize += getDirectorySize(fullPath);
      } else if (entry.isFile()) {
        try {
          const stats = fs.statSync(fullPath);
          totalSize += stats.size;
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
  return totalSize;
}

function getPythonInterpreterPath(runtimeDir: string): string {
  const venvDir = path.join(runtimeDir, ".venv");
  const winPath = path.join(venvDir, "Scripts", "python.exe");
  const nixPath = path.join(venvDir, "bin", "python");

  if (process.platform === "win32") {
    return fs.existsSync(winPath) ? winPath : nixPath;
  }
  return fs.existsSync(nixPath) ? nixPath : winPath;
}

function normalizeContent(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .sort()
    .join("\n");
}

function computeSourceHash(pythonVersion: string, sourceType: string, content: string): string {
  const normalized = sourceType === "uv.lock" ? content.replace(/\r\n/g, "\n").trim() : normalizeContent(content);
  const input = `${pythonVersion}\n${sourceType}\n${normalized}`;
  return crypto.createHash("sha256").update(input).digest("hex");
}

function parsePackagesFromRequirements(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim().split("#")[0].trim())
    .filter((line) => line.length > 0 && !line.startsWith("-"))
    .map((line) => line.split(/[=<>!~;]/)[0].trim());
}

// ---------------------------------------------------------------------------
// Lock File Management (Build Locks)
// ---------------------------------------------------------------------------

async function acquireBuildLock(lockPath: string): Promise<() => void> {
  const startTime = Date.now();

  while (fs.existsSync(lockPath)) {
    try {
      const stats = fs.statSync(lockPath);
      const ageMs = Date.now() - stats.mtimeMs;
      if (ageMs > BUILD_TIMEOUT_MS) {
        console.warn(`[runtime-manager] Stale build lock detected at ${lockPath} (age: ${Math.round(ageMs / 1000)}s). Cleaning up.`);
        try { fs.unlinkSync(lockPath); } catch {}
        break;
      }
    } catch {
      break;
    }

    if (Date.now() - startTime > BUILD_TIMEOUT_MS) {
      throw new Error(`Timed out waiting for runtime build lock at: ${lockPath}`);
    }

    await new Promise((res) => setTimeout(res, 1000));
  }

  ensureDir(path.dirname(lockPath));
  fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), "utf-8");

  return () => {
    try {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
    } catch {
      /* ignore */
    }
  };
}

// ---------------------------------------------------------------------------
// Runtime Service Class
// ---------------------------------------------------------------------------

export const runtimeService = {
  init(): void {
    ensureDir(RUNTIMES_DIR);
    console.log(`[runtime-manager] Storage initialized at: ${RUNTIMES_DIR}`);
  },

  /**
   * Detect dependency source in agent directory.
   * Priority: 1. uv.lock, 2. pyproject.toml, 3. requirements.txt
   */
  detectDependencies(agentDir: string, targetPythonVersion = "3.11"): DependencyDetectionResult {
    const uvLockPath = path.join(agentDir, "uv.lock");
    const pyprojectPath = path.join(agentDir, "pyproject.toml");
    const reqPath = path.join(agentDir, "requirements.txt");

    let sourceType: DependencyDetectionResult["sourceType"] = "none";
    let sourcePath: string | undefined;
    let content = "";
    let packages: string[] = [];

    const hasUvLock = fs.existsSync(uvLockPath);
    const hasPyproject = fs.existsSync(pyprojectPath);
    const hasReq = fs.existsSync(reqPath);

    if (hasUvLock) {
      sourceType = "uv.lock";
      sourcePath = uvLockPath;
      content = fs.readFileSync(uvLockPath, "utf-8");
      packages = parsePackagesFromRequirements(content);
    } else if (hasPyproject) {
      sourceType = "pyproject.toml";
      sourcePath = pyprojectPath;
      content = fs.readFileSync(pyprojectPath, "utf-8");
      packages = parsePackagesFromRequirements(content);
    } else if (hasReq) {
      sourceType = "requirements.txt";
      sourcePath = reqPath;
      content = fs.readFileSync(reqPath, "utf-8");
      packages = parsePackagesFromRequirements(content);
    }

    const sourceHash = computeSourceHash(targetPythonVersion, sourceType, content);
    const runtimeHash = sourceHash.slice(0, 16);

    return {
      sourceType,
      sourcePath,
      content,
      sourceHash,
      pythonVersion: targetPythonVersion,
      runtimeHash,
      packages,
      filesChecked: {
        "uv.lock": hasUvLock,
        "pyproject.toml": hasPyproject,
        "requirements.txt": hasReq,
      },
    };
  },

  /**
   * Get metadata path for a runtime hash
   */
  getRuntimeDir(runtimeHash: string, pythonShort = "py311"): string {
    return path.join(RUNTIMES_DIR, pythonShort, runtimeHash);
  },

  /**
   * Read metadata.json for a runtime hash
   */
  getMetadata(runtimeHash: string, pythonShort = "py311"): RuntimeMetadata | null {
    const runtimeDir = this.getRuntimeDir(runtimeHash, pythonShort);
    const metaPath = path.join(runtimeDir, "metadata.json");
    if (!fs.existsSync(metaPath)) return null;
    try {
      const raw = fs.readFileSync(metaPath, "utf-8");
      const meta = JSON.parse(raw) as RuntimeMetadata;
      meta.sizeBytes = getDirectorySize(runtimeDir);
      return meta;
    } catch {
      return null;
    }
  },

  /**
   * Save metadata.json
   */
  saveMetadata(meta: RuntimeMetadata): void {
    const runtimeDir = this.getRuntimeDir(meta.hash, meta.pythonShort);
    ensureDir(runtimeDir);
    const metaPath = path.join(runtimeDir, "metadata.json");
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
  },

  /**
   * Associate an agent with a runtime hash
   */
  associateAgent(runtimeHash: string, agentId: string, pythonShort = "py311"): void {
    const meta = this.getMetadata(runtimeHash, pythonShort);
    if (!meta) return;
    if (!meta.agents.includes(agentId)) {
      meta.agents.push(agentId);
      meta.agentCount = meta.agents.length;
      meta.lastUsedAt = new Date().toISOString();
      this.saveMetadata(meta);
    }
  },

  /**
   * Disassociate an agent from a runtime hash
   */
  disassociateAgent(runtimeHash: string, agentId: string, pythonShort = "py311"): void {
    const meta = this.getMetadata(runtimeHash, pythonShort);
    if (!meta) return;
    if (meta.agents.includes(agentId)) {
      meta.agents = meta.agents.filter((a) => a !== agentId);
      meta.agentCount = meta.agents.length;
      this.saveMetadata(meta);
    }
  },

  /**
   * List all managed runtimes across python versions
   */
  listRuntimes(): RuntimeMetadata[] {
    ensureDir(RUNTIMES_DIR);
    const runtimes: RuntimeMetadata[] = [];

    const pyDirs = fs.readdirSync(RUNTIMES_DIR, { withFileTypes: true });
    for (const pyDir of pyDirs) {
      if (!pyDir.isDirectory()) continue;
      const pyPath = path.join(RUNTIMES_DIR, pyDir.name);
      const hashDirs = fs.readdirSync(pyPath, { withFileTypes: true });
      for (const hashDir of hashDirs) {
        if (!hashDir.isDirectory()) continue;
        const meta = this.getMetadata(hashDir.name, pyDir.name);
        if (meta) {
          runtimes.push(meta);
        }
      }
    }

    return runtimes.sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime());
  },

  /**
   * Resolve runtime for an agent.
   * Finds existing matching runtime or creates a new one using uv.
   */
  async resolveRuntime(
    agentDir: string,
    agentId?: string,
    pythonVersion = "3.11",
    onLog?: (msg: string) => void
  ): Promise<RuntimeResolveResult> {
    const startTime = Date.now();
    const log = (msg: string) => {
      console.log(`[runtime-manager] ${msg}`);
      if (onLog) onLog(msg);
    };

    const depInfo = this.detectDependencies(agentDir, pythonVersion);
    if (depInfo.sourceType === "none") {
      return {
        hash: "none",
        reuseExisting: false,
        state: "available",
        interpreterPath: "python",
        elapsedMs: Date.now() - startTime,
        message: "No dependency descriptor found. Using system Python fallback.",
      };
    }

    const pythonShort = `py${pythonVersion.replace(".", "")}`;
    const runtimeHash = depInfo.runtimeHash;
    const runtimeDir = this.getRuntimeDir(runtimeHash, pythonShort);
    const lockPath = path.join(RUNTIMES_DIR, pythonShort, `${runtimeHash}.lock`);

    // Check if runtime already exists and is available
    const existingMeta = this.getMetadata(runtimeHash, pythonShort);
    const interpreterPath = getPythonInterpreterPath(runtimeDir);

    if (existingMeta && existingMeta.state === "available" && fs.existsSync(interpreterPath)) {
      log(`Reusing existing runtime ${runtimeHash} (${existingMeta.agentCount} agents attached)`);
      if (agentId) {
        this.associateAgent(runtimeHash, agentId, pythonShort);
      }
      return {
        hash: runtimeHash,
        reuseExisting: true,
        state: "available",
        interpreterPath,
        elapsedMs: Date.now() - startTime,
        message: `Reused existing runtime (${runtimeHash})`,
      };
    }

    // Build lock
    log(`Acquiring build lock for runtime ${runtimeHash}...`);
    const releaseLock = await acquireBuildLock(lockPath);

    try {
      // Re-check inside lock
      const doubleCheckMeta = this.getMetadata(runtimeHash, pythonShort);
      if (doubleCheckMeta && doubleCheckMeta.state === "available" && fs.existsSync(interpreterPath)) {
        log(`Runtime ${runtimeHash} was built concurrently by another process.`);
        if (agentId) {
          this.associateAgent(runtimeHash, agentId, pythonShort);
        }
        return {
          hash: runtimeHash,
          reuseExisting: true,
          state: "available",
          interpreterPath,
          elapsedMs: Date.now() - startTime,
          message: `Reused runtime created by concurrent process (${runtimeHash})`,
        };
      }

      log(`Creating isolated runtime at ${runtimeDir}...`);
      ensureDir(runtimeDir);

      // Write initial metadata
      const initialMeta: RuntimeMetadata = {
        hash: runtimeHash,
        python: pythonVersion,
        pythonShort,
        agents: agentId ? [agentId] : [],
        agentCount: agentId ? 1 : 0,
        sizeBytes: 0,
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        sourceHash: depInfo.sourceHash,
        sourceType: depInfo.sourceType,
        state: "building",
      };
      this.saveMetadata(initialMeta);

      // Copy source file to runtime directory
      if (depInfo.sourcePath && fs.existsSync(depInfo.sourcePath)) {
        fs.copyFileSync(depInfo.sourcePath, path.join(runtimeDir, "source.lock"));
      }

      let installStdout = "";
      let installStderr = "";

      // Step 1: Create venv with uv
      const venvDir = path.join(runtimeDir, ".venv");
      log(`Running: uv venv ${venvDir}`);
      const uvEnv = { ...process.env, VIRTUAL_ENV: venvDir, UV_CACHE_DIR: getUvCacheRoot() };

      try {
        const res = await execFileAsync("uv", ["venv", venvDir, "--python", pythonVersion], { cwd: runtimeDir, env: uvEnv });
        installStdout += (res.stdout || "") + "\n";
        installStderr += (res.stderr || "") + "\n";
      } catch (err) {
        log(`uv venv failed, attempting standard python3 -m venv fallback...`);
        const res = await execFileAsync("python3", ["-m", "venv", venvDir], { cwd: runtimeDir });
        installStdout += (res.stdout || "") + "\n";
        installStderr += (res.stderr || "") + "\n";
      }

      // Step 2: Install dependencies
      log(`Installing dependencies from ${depInfo.sourceType}...`);
      if (depInfo.sourceType === "uv.lock") {
        try {
          const res = await execFileAsync("uv", ["sync", "--frozen"], { cwd: agentDir, env: uvEnv });
          installStdout += (res.stdout || "") + "\n";
          installStderr += (res.stderr || "") + "\n";
        } catch {
          const res = await execFileAsync("uv", ["pip", "sync", depInfo.sourcePath!], { cwd: runtimeDir, env: uvEnv });
          installStdout += (res.stdout || "") + "\n";
          installStderr += (res.stderr || "") + "\n";
        }
      } else if (depInfo.sourceType === "pyproject.toml") {
        try {
          const res = await execFileAsync("uv", ["pip", "install", "-r", depInfo.sourcePath!], { cwd: runtimeDir, env: uvEnv });
          installStdout += (res.stdout || "") + "\n";
          installStderr += (res.stderr || "") + "\n";
        } catch {
          const res = await execFileAsync("uv", ["pip", "install", "."], { cwd: agentDir, env: uvEnv });
          installStdout += (res.stdout || "") + "\n";
          installStderr += (res.stderr || "") + "\n";
        }
      } else if (depInfo.sourceType === "requirements.txt") {
        const res = await execFileAsync("uv", ["pip", "install", "-r", depInfo.sourcePath!], { cwd: runtimeDir, env: uvEnv });
        installStdout += (res.stdout || "") + "\n";
        installStderr += (res.stderr || "") + "\n";
      }

      const finalInterpreter = getPythonInterpreterPath(runtimeDir);
      const durationMs = Date.now() - startTime;

      // Finalize metadata
      initialMeta.state = "available";
      initialMeta.sizeBytes = getDirectorySize(runtimeDir);
      initialMeta.durationMs = durationMs;
      initialMeta.stdout = installStdout.trim();
      initialMeta.stderr = installStderr.trim();
      initialMeta.packageCount = depInfo.packages.length;
      this.saveMetadata(initialMeta);

      log(`Runtime ${runtimeHash} built successfully in ${durationMs}ms.`);

      return {
        hash: runtimeHash,
        reuseExisting: false,
        state: "available",
        interpreterPath: finalInterpreter,
        installedPackageCount: depInfo.packages.length,
        elapsedMs: Date.now() - startTime,
        message: `Built new isolated runtime (${runtimeHash})`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`Failed to build runtime ${runtimeHash}: ${msg}`);

      const errorMeta: RuntimeMetadata = {
        hash: runtimeHash,
        python: pythonVersion,
        pythonShort,
        agents: agentId ? [agentId] : [],
        agentCount: agentId ? 1 : 0,
        sizeBytes: getDirectorySize(runtimeDir),
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        sourceHash: depInfo.sourceHash,
        sourceType: depInfo.sourceType,
        state: "error",
        errorMessage: msg,
      };
      this.saveMetadata(errorMeta);

      throw new Error(`Runtime build failed: ${msg}`);
    } finally {
      releaseLock();
    }
  },

  /**
   * Check if an agent's runtime is stale (source hash changed).
   */
  checkStale(agentDir: string, currentRuntimeHash: string, pythonVersion = "3.11"): { isStale: boolean; currentHash: string; expectedHash: string } {
    const depInfo = this.detectDependencies(agentDir, pythonVersion);
    const expectedHash = depInfo.runtimeHash;
    const isStale = currentRuntimeHash !== expectedHash;

    if (isStale && currentRuntimeHash) {
      const meta = this.getMetadata(currentRuntimeHash);
      if (meta && meta.state !== "stale") {
        meta.state = "stale";
        this.saveMetadata(meta);
      }
    }

    return { isStale, currentHash: currentRuntimeHash, expectedHash };
  },

  /**
   * Run Garbage Collection
   * Rules:
   * - delete runtimes with agentCount == 0
   * - delete unused for 30 days
   * - keep 3 most recently used
   * - max disk quota: 10 GB
   */
  runGC(maxQuotaBytes = 10 * 1024 * 1024 * 1024): GCResult {
    const allRuntimes = this.listRuntimes();
    const result: GCResult = {
      deleted: [],
      retained: [],
      freedBytes: 0,
      reasons: {},
    };

    if (allRuntimes.length === 0) return result;

    // Sort by lastUsedAt descending
    const sorted = [...allRuntimes].sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime());

    // Keep top 3 most recently used regardless
    const protectedHashes = new Set(sorted.slice(0, 3).map((r) => r.hash));

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    let currentTotalSize = sorted.reduce((sum, r) => sum + r.sizeBytes, 0);

    for (const runtime of sorted) {
      if (protectedHashes.has(runtime.hash)) {
        result.retained.push(runtime.hash);
        result.reasons[runtime.hash] = "Protected (Top 3 most recent)";
        continue;
      }

      let shouldDelete = false;
      let reason = "";

      if (runtime.agentCount === 0) {
        shouldDelete = true;
        reason = "Orphaned runtime (agentCount == 0)";
      } else if (new Date(runtime.lastUsedAt).getTime() < thirtyDaysAgo) {
        shouldDelete = true;
        reason = "Unused for > 30 days";
      } else if (currentTotalSize > maxQuotaBytes) {
        shouldDelete = true;
        reason = "Exceeds 10 GB disk quota";
      }

      if (shouldDelete) {
        try {
          const runtimeDir = this.getRuntimeDir(runtime.hash, runtime.pythonShort);
          if (fs.existsSync(runtimeDir)) {
            fs.rmSync(runtimeDir, { recursive: true, force: true });
          }
          result.deleted.push(runtime.hash);
          result.freedBytes += runtime.sizeBytes;
          currentTotalSize -= runtime.sizeBytes;
          result.reasons[runtime.hash] = reason;
          console.log(`[runtime-manager] GC deleted runtime ${runtime.hash}: ${reason}`);
        } catch (err) {
          console.error(`[runtime-manager] Failed to delete runtime ${runtime.hash}: ${err}`);
          result.retained.push(runtime.hash);
          result.reasons[runtime.hash] = `Deletion failed: ${err}`;
        }
      } else {
        result.retained.push(runtime.hash);
        result.reasons[runtime.hash] = "Active and within limits";
      }
    }

    return result;
  },

  /**
   * Delete a single runtime
   */
  deleteRuntime(runtimeHash: string, pythonShort = "py311"): boolean {
    const meta = this.getMetadata(runtimeHash, pythonShort);
    if (meta && meta.agentCount > 0) {
      throw new Error(`Cannot delete active runtime ${runtimeHash}: ${meta.agentCount} agent(s) associated.`);
    }

    const runtimeDir = this.getRuntimeDir(runtimeHash, pythonShort);
    if (fs.existsSync(runtimeDir)) {
      fs.rmSync(runtimeDir, { recursive: true, force: true });
      return true;
    }
    return false;
  },
};
