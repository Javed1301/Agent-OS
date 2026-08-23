import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import type { ExecutionStatus } from "../types/execution.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = process.env["WORKSPACE_ROOT"]
  ? path.resolve(process.env["WORKSPACE_ROOT"])
  : path.resolve(__dirname, "../../../..");
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(WORKSPACE_ROOT, "data");
const EXEC_DIR = path.join(DATA_DIR, "executions");
const INDEX_PATH = path.join(EXEC_DIR, "index.json");
const MARKER_PATH = path.join(DATA_DIR, ".migration_v1_complete");

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "file:../../../data/agent-os.db",
    },
  },
});

export async function runHistoricalMigration(): Promise<void> {
  if (process.env.TEST_ENV === "true") {
    const resolvedUrl = process.env.DATABASE_URL || "";
    const isTestDb = resolvedUrl.includes("agent-os.test.db") || resolvedUrl.includes("test");
    if (!isTestDb) {
      console.error("FATAL: Test environment is active but DATABASE_URL does not point to a test database!");
      process.exit(1);
    }
  }
  if (fs.existsSync(MARKER_PATH)) {
    console.log("[migration] SQLite database migration already completed (marker found).");
    return;
  }

  if (!fs.existsSync(INDEX_PATH)) {
    console.log("[migration] No historical index.json found. Marking migration as complete.");
    fs.writeFileSync(MARKER_PATH, new Date().toISOString(), "utf-8");
    return;
  }

  console.log("[migration] Starting historical execution data migration to SQLite...");
  let totalRecords = 0;
  let migratedCount = 0;
  let skippedCount = 0;
  let staleNormalizedCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  try {
    const rawIndex = fs.readFileSync(INDEX_PATH, "utf-8");
    const indexEntries = JSON.parse(rawIndex) as Array<{
      id: string;
      agentId: string;
      status: string;
      startTime: string;
      endTime?: string;
      durationMs?: number;
    }>;

    totalRecords = indexEntries.length;
    console.log(`[migration] Found ${totalRecords} historical executions to process.`);

    for (const indexEntry of indexEntries) {
      try {
        // 1. Check if execution already exists in DB to prevent duplicates
        const existing = await prisma.execution.findUnique({
          where: { id: indexEntry.id },
        });

        if (existing) {
          skippedCount++;
          continue;
        }

        // 2. Locate output file (Format B: nested directory, Format A: flat file)
        const formatBPath = path.join(EXEC_DIR, indexEntry.id, "output.json");
        const formatAPath = path.join(EXEC_DIR, `${indexEntry.id}.json`);

        let recordData: any = null;

        if (fs.existsSync(formatBPath)) {
          try {
            recordData = JSON.parse(fs.readFileSync(formatBPath, "utf-8"));
          } catch (err) {
            console.warn(`[migration] Malformed Format B output.json for ${indexEntry.id}, falling back.`);
          }
        }

        if (!recordData && fs.existsSync(formatAPath)) {
          try {
            recordData = JSON.parse(fs.readFileSync(formatAPath, "utf-8"));
          } catch (err) {
            console.warn(`[migration] Malformed Format A JSON for ${indexEntry.id}, falling back.`);
          }
        }

        // 3. Fallback to index entry if file is missing/malformed
        if (!recordData) {
          console.warn(`[migration] Missing file contents for ${indexEntry.id}. Seeding from index entry.`);
          recordData = { ...indexEntry };
        }

        // 4. Normalize fields
        const id = recordData.id || indexEntry.id;
        const agentId = recordData.agentId || indexEntry.agentId || "unknown-agent";
        
        let status = (recordData.status || indexEntry.status) as ExecutionStatus;
        let endTime = recordData.endTime || indexEntry.endTime ? new Date(recordData.endTime || indexEntry.endTime) : null;
        let durationMs = recordData.durationMs ?? indexEntry.durationMs ?? null;
        let error = recordData.error || null;

        // Force stale running or queued runs to failed
        if (status === "running" || status === "queued") {
          status = "failed";
          error = "Process interrupted — migrated from JSON store";
          endTime = new Date(recordData.startTime || indexEntry.startTime);
          durationMs = 0;
          staleNormalizedCount++;
        }

        const input = recordData.input ? JSON.stringify(recordData.input) : JSON.stringify({});
        const result = recordData.result ? JSON.stringify(recordData.result) : null;
        const outputFiles = recordData.outputFiles ? JSON.stringify(recordData.outputFiles) : null;
        const exitCode = recordData.exitCode ?? null;
        const startTime = new Date(recordData.startTime || indexEntry.startTime || new Date());

        // 5. Ensure Agent row exists
        await prisma.agent.upsert({
          where: { id: agentId },
          update: {},
          create: { id: agentId, name: agentId },
        });

        // 6. Insert Execution row
        await prisma.execution.create({
          data: {
            id,
            agentId,
            status,
            startTime,
            endTime,
            durationMs,
            error,
            exitCode,
            input,
            result,
            outputFiles,
          },
        });

        migratedCount++;
      } catch (err: any) {
        errorCount++;
        const msg = `Failed to migrate ${indexEntry.id}: ${err.message}`;
        console.error(`[migration] ${msg}`);
        errors.push(msg);
      }
    }

    // Write completion marker file if there are no major fatal blocker errors
    fs.writeFileSync(MARKER_PATH, JSON.stringify({
      migratedAt: new Date().toISOString(),
      totalRecords,
      migratedCount,
      skippedCount,
      staleNormalizedCount,
      errorCount,
      errors,
    }, null, 2), "utf-8");

    console.log("\n[migration] ===== Migration Report =====");
    console.log(`[migration] Total index records found: ${totalRecords}`);
    console.log(`[migration] Successfully migrated:    ${migratedCount}`);
    console.log(`[migration] Skipped (already in DB):   ${skippedCount}`);
    console.log(`[migration] Stale runs normalized:     ${staleNormalizedCount}`);
    console.log(`[migration] Errors encountered:        ${errorCount}`);
    console.log("[migration] ============================\n");

  } catch (err: any) {
    console.error(`[migration] Fatal migration failure: ${err.message}`);
  }
}
