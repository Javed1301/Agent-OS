/**
 * Migration Script — Agent Path Normalization & Portability
 *
 * Scans all agent.yaml manifests in agents/ and external-agents/,
 * detects host-specific absolute paths (e.g. D:/Javed/...),
 * converts them to workspace-relative portable paths (agents/<id>),
 * updates source field ("workspace" | "imported"),
 * and rewrites data/registry/external-agents.json to use relative paths.
 *
 * Usage:
 *   npx tsx scripts/migrate-agent-paths.ts
 *   npm run migrate:agent-paths
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = process.env["WORKSPACE_ROOT"]
  ? path.resolve(process.env["WORKSPACE_ROOT"])
  : path.resolve(__dirname, "..");

const AGENTS_DIR = path.join(WORKSPACE_ROOT, "agents");
const EXTERNAL_AGENTS_DIR = path.join(WORKSPACE_ROOT, "external-agents");
const EXTERNAL_REGISTRY_PATH = path.join(WORKSPACE_ROOT, "data", "registry", "external-agents.json");

interface AgentManifest {
  id: string;
  name: string;
  workingDirectory: string;
  source?: "workspace" | "imported";
  [key: string]: unknown;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

function isAbsolutePath(p: string): boolean {
  return path.isAbsolute(p) || /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("/");
}

function migrateManifest(manifestPath: string, isWorkspaceFolder: boolean): { id: string; oldPath: string; newPath: string; changed: boolean } | null {
  if (!fs.existsSync(manifestPath)) return null;

  try {
    const raw = fs.readFileSync(manifestPath, "utf-8");
    const manifest = yaml.load(raw) as AgentManifest;

    if (!manifest || !manifest.id) return null;

    const oldPath = manifest.workingDirectory || "";
    let newPath = oldPath;
    let changed = false;

    const targetSource = isWorkspaceFolder ? "workspace" : "imported";
    if (manifest.source !== targetSource) {
      manifest.source = targetSource;
      changed = true;
    }

    if (isAbsolutePath(oldPath)) {
      if (isWorkspaceFolder) {
        newPath = `agents/${manifest.id}`;
      } else {
        newPath = `external-agents/${manifest.id}`;
      }
      manifest.workingDirectory = newPath;
      changed = true;
    } else {
      const normalized = normalizePath(oldPath);
      if (normalized !== oldPath) {
        manifest.workingDirectory = normalized;
        changed = true;
      }
    }

    // Secrets schema migration
    const legacyReq = (manifest as any).healthcheck?.requiredEnv || [];
    const legacyEnvKeys = (manifest as any).env ? Object.keys((manifest as any).env) : [];
    const combinedRequired = Array.from(new Set([
      ...((manifest as any).secrets?.required || []),
      ...legacyReq,
      ...legacyEnvKeys,
    ]));

    if (combinedRequired.length > 0 && !(manifest as any).secrets) {
      console.warn(`[migrate] Migrating legacy requiredEnv for agent '${manifest.id}' to secrets.required.`);
      (manifest as any).secrets = {
        required: combinedRequired,
        optional: (manifest as any).secrets?.optional || [],
      };
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(manifestPath, yaml.dump(manifest, { lineWidth: -1 }), "utf-8");
    }

    return {
      id: manifest.id,
      oldPath,
      newPath: manifest.workingDirectory,
      changed,
    };
  } catch (err) {
    console.error(`[migrate] Error processing ${manifestPath}:`, err);
    return null;
  }
}

function runMigration(): void {
  console.log("==================================================");
  console.log("🚀 Agent Path Resolution Migration Tool");
  console.log(`   Workspace Root: ${WORKSPACE_ROOT}`);
  console.log("==================================================\n");

  let totalScanned = 0;
  let totalMigrated = 0;
  const records: Array<{ id: string; oldPath: string; newPath: string; status: string }> = [];

  // 1. Scan agents/ directory
  if (fs.existsSync(AGENTS_DIR)) {
    const folders = fs.readdirSync(AGENTS_DIR);
    for (const folder of folders) {
      const manifestPath = path.join(AGENTS_DIR, folder, "agent.yaml");
      const res = migrateManifest(manifestPath, true);
      if (res) {
        totalScanned++;
        if (res.changed) totalMigrated++;
        records.push({
          id: res.id,
          oldPath: res.oldPath,
          newPath: res.newPath,
          status: res.changed ? "Migrated -> Relative" : "Already Portable",
        });
      }
    }
  }

  // 2. Scan external-agents/ directory
  if (fs.existsSync(EXTERNAL_AGENTS_DIR)) {
    const folders = fs.readdirSync(EXTERNAL_AGENTS_DIR);
    for (const folder of folders) {
      const manifestPath = path.join(EXTERNAL_AGENTS_DIR, folder, "agent.yaml");
      const res = migrateManifest(manifestPath, false);
      if (res) {
        totalScanned++;
        if (res.changed) totalMigrated++;
        records.push({
          id: res.id,
          oldPath: res.oldPath,
          newPath: res.newPath,
          status: res.changed ? "Migrated -> Relative" : "Already Portable",
        });
      }
    }
  }

  // 3. Scan external-agents.json
  if (fs.existsSync(EXTERNAL_REGISTRY_PATH)) {
    try {
      const raw = fs.readFileSync(EXTERNAL_REGISTRY_PATH, "utf-8");
      const entries = JSON.parse(raw) as Array<{ id: string; path: string }>;
      let updated = false;

      const newEntries = entries.map((entry) => {
        if (isAbsolutePath(entry.path)) {
          updated = true;
          const relativePath = `external-agents/${entry.id}`;
          return { id: entry.id, path: relativePath };
        }
        return entry;
      });

      if (updated) {
        fs.writeFileSync(EXTERNAL_REGISTRY_PATH, JSON.stringify(newEntries, null, 2), "utf-8");
        console.log(`[migrate] Cleaned external-agents.json to use workspace-relative paths.`);
      }
    } catch (err) {
      console.warn(`[migrate] Warning reading external-agents.json:`, err);
    }
  }

  // Print Summary Table
  console.log("Migration Summary:\n");
  console.table(records);

  console.log(`\nResults: ${totalScanned} scanned, ${totalMigrated} updated.`);
  console.log("✨ All agent manifests are now portable across Windows, Linux, and Docker!\n");
}

runMigration();
