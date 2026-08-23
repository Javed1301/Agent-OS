import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v4 as uuidv4 } from "uuid";
import type { Response } from "express";
import type { WorkflowDefinition, WorkflowRunRecord, StepRunRecord } from "./types.js";
import { loadWorkflows } from "./parser.js";
import { resolveTemplate } from "./resolver.js";
import { registryService } from "../services/registry.service.js";
import { executionService } from "../services/execution.service.js";
import { storeRepository } from "../repositories/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = process.env["WORKSPACE_ROOT"]
  ? path.resolve(process.env["WORKSPACE_ROOT"])
  : path.resolve(__dirname, "../../../..");
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(WORKSPACE_ROOT, "data");
const EXEC_DIR = path.join(DATA_DIR, "executions");

// ---------------------------------------------------------------------------
// Active workflow runs — in-memory tracker for SSE connections
// ---------------------------------------------------------------------------

interface ActiveWorkflowRun {
  consumers: Response[];
  eventLog: Array<{ type: string; data: unknown; timestamp: string }>;
  finished: boolean;
  startTime: number;
}

const activeWorkflowRuns = new Map<string, ActiveWorkflowRun>();

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function setSseHeaders(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();
}

function writeSseEvent(res: Response, type: string, data: unknown, workflowRunId: string): void {
  if (res.writableEnded) return;
  const event = JSON.stringify({
    type,
    data,
    workflowRunId,
    timestamp: new Date().toISOString(),
  });
  res.write(`data: ${event}\n\n`);
}

function broadcast(runId: string, type: string, data: unknown): void {
  const active = activeWorkflowRuns.get(runId);
  if (!active) return;

  const entry = { type, data, timestamp: new Date().toISOString() };
  active.eventLog.push(entry);

  for (const res of active.consumers) {
    writeSseEvent(res, type, data, runId);
  }
}

function saveWorkflowState(record: WorkflowRunRecord): void {
  const runDir = path.join(EXEC_DIR, record.id);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(
    path.join(runDir, "workflow_state.json"),
    JSON.stringify(record, null, 2),
    "utf-8"
  );
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function waitForExecution(execId: string): Promise<any> {
  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      const record = await storeRepository.getById(execId);
      if (record && record.status !== "queued" && record.status !== "running") {
        clearInterval(interval);
        resolve(record);
      }
    }, 200);
  });
}

// ---------------------------------------------------------------------------
// Workflow Engine Service
// ---------------------------------------------------------------------------

let _workflows: WorkflowDefinition[] = [];

export const workflowsEngine = {
  load(): void {
    _workflows = loadWorkflows();
  },

  listWorkflows(): WorkflowDefinition[] {
    return [..._workflows];
  },

  getWorkflow(id: string): WorkflowDefinition | undefined {
    return _workflows.find((w) => w.id === id);
  },

  async runWorkflow(workflowId: string, input: Record<string, unknown>): Promise<string> {
    const workflow = this.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow '${workflowId}' not found.`);
    }

    // Validation before execution
    const stepIds = new Set<string>();
    for (const step of workflow.steps) {
      if (stepIds.has(step.id)) {
        throw new Error(`Workflow validation failed: Duplicate step ID '${step.id}' found.`);
      }
      stepIds.add(step.id);

      const agent = registryService.getAgent(step.agent);
      if (!agent) {
        throw new Error(`Workflow validation failed: Agent '${step.agent}' referenced in step '${step.id}' does not exist.`);
      }
    }

    const previousStepIds = new Set<string>();
    for (const step of workflow.steps) {
      const regex = /\$\{(.+?)\}/g;

      const validateTemplate = (obj: any) => {
        if (typeof obj === "string") {
          let match;
          regex.lastIndex = 0;
          while ((match = regex.exec(obj)) !== null) {
            const expr = match[1].trim();
            const parts = expr.split(".");
            if (parts[0] === "workflow") {
              if (parts[1] !== "input") {
                throw new Error(
                  `Workflow validation failed in step '${step.id}': Invalid workflow reference '${expr}'. Must be 'workflow.input.<field>'.`
                );
              }
            } else {
              const refStepId = parts[0];
              const prop = parts[1];
              if (!stepIds.has(refStepId)) {
                throw new Error(
                  `Workflow validation failed in step '${step.id}': Referenced step '${refStepId}' does not exist in the workflow.`
                );
              }
              if (!previousStepIds.has(refStepId)) {
                throw new Error(
                  `Workflow validation failed in step '${step.id}': Referenced step '${refStepId}' is not a previous step. Forward references are not allowed.`
                );
              }
              if (prop !== "output" && prop !== "artifacts") {
                throw new Error(
                  `Workflow validation failed in step '${step.id}': Invalid step reference '${expr}'. Must reference 'output' or 'artifacts' (e.g. '${refStepId}.output' or '${refStepId}.artifacts').`
                );
              }
            }
          }
        } else if (typeof obj === "object" && obj !== null) {
          Object.values(obj).forEach(validateTemplate);
        }
      };

      validateTemplate(step.input);
      previousStepIds.add(step.id);
    }

    const runId = `wf_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${uuidv4().slice(0, 8)}`;
    const now = new Date().toISOString();

    const record: WorkflowRunRecord = {
      id: runId,
      workflowId,
      input,
      status: "running",
      startTime: now,
      steps: workflow.steps.map((s) => ({
        stepId: s.id,
        executionId: "",
        status: "queued",
      })),
    };

    activeWorkflowRuns.set(runId, {
      consumers: [],
      eventLog: [],
      finished: false,
      startTime: Date.now(),
    });

    // Setup folder structure
    const runDir = path.join(EXEC_DIR, runId);
    fs.mkdirSync(path.join(runDir, "logs"), { recursive: true });

    // Write input.json and initial state
    fs.writeFileSync(path.join(runDir, "input.json"), JSON.stringify(input, null, 2), "utf-8");
    saveWorkflowState(record);

    // Run asynchronously
    void this._runAsync(workflow, input, runId, record, runDir);

    return runId;
  },

  async _runAsync(
    workflow: WorkflowDefinition,
    input: Record<string, unknown>,
    runId: string,
    record: WorkflowRunRecord,
    runDir: string
  ): Promise<void> {
    const active = activeWorkflowRuns.get(runId);
    if (!active) return;

    broadcast(runId, "workflow_started", { runId, workflowId: workflow.id });

    const stepResults = new Map<string, any>();
    const stepExecIds = new Map<string, string>();

    try {
      for (let i = 0; i < workflow.steps.length; i++) {
        // Double-check cancellation before starting the step
        const currentRecord = this.getRun(runId);
        if (currentRecord?.status === "cancelled") {
          return;
        }

        const step = workflow.steps[i];

        record.steps[i].status = "running";
        record.steps[i].startTime = new Date().toISOString();
        saveWorkflowState(record);

        broadcast(runId, "step_started", { stepId: step.id, agentId: step.agent });

        // Resolve inputs recursively
        const resolvedInput = resolveTemplate(step.input, input, stepResults, stepExecIds, runId);

        const agent = registryService.getAgent(step.agent);
        if (!agent) {
          throw new Error(`Agent '${step.agent}' required for step '${step.id}' not found.`);
        }

        // Execute using existing execution service
        const execId = await executionService.execute(agent, resolvedInput);
        record.steps[i].executionId = execId;
        stepExecIds.set(step.id, execId);
        saveWorkflowState(record);

        // Also stream real-time logs from execution step to the workflow clients
        // We'll poll the logs or monitor the execution's log file
        // To be simple and non-intrusive, we wait for execution completion,
        // and we periodically stream logs if possible, but the CLI or client can get them.
        // Wait, the prompt says we should emit "step_log" events.
        // Let's implement a log reader that streams newly appended log lines for this execution!
        const logPath = storeRepository.getLogPath(execId);
        let logBytesRead = 0;
        const logInterval = setInterval(() => {
          if (fs.existsSync(logPath)) {
            try {
              const stats = fs.statSync(logPath);
              if (stats.size > logBytesRead) {
                const stream = fs.createReadStream(logPath, { start: logBytesRead, encoding: "utf-8" });
                stream.on("data", (chunk: string) => {
                  const lines = chunk.split("\n");
                  for (const line of lines) {
                    if (line.trim()) {
                      // Extract message from standard format YYYY-MM-DDTHH:MM:SS.sssZ msg
                      const msg = line.substring(25);
                      broadcast(runId, "step_log", { stepId: step.id, log: msg });
                    }
                  }
                });
                logBytesRead = stats.size;
              }
            } catch {
              // Ignore file lock issues
            }
          }
        }, 300);

        // Wait for execution completion
        const execRecord = await waitForExecution(execId);
        clearInterval(logInterval);

        // Make sure we stream any remaining logs
        if (fs.existsSync(logPath)) {
          try {
            const stats = fs.statSync(logPath);
            if (stats.size > logBytesRead) {
              const content = fs.readFileSync(logPath, "utf-8").slice(logBytesRead);
              const lines = content.split("\n");
              for (const line of lines) {
                if (line.trim()) {
                  broadcast(runId, "step_log", { stepId: step.id, log: line.substring(25) });
                }
              }
            }
          } catch {}
        }

        // Copy log file to workflow directory logs/
        if (fs.existsSync(logPath)) {
          fs.copyFileSync(logPath, path.join(runDir, "logs", `${step.id}_logs.txt`));
        }

        if (execRecord.status === "completed") {
          record.steps[i].status = "completed";
          record.steps[i].endTime = new Date().toISOString();

          // Save step result genericly with output and artifacts properties
          const result = execRecord.result ?? {};
          const outputVal = (result && typeof result === "object" && "output" in result) ? (result as any).output : result;
          const workflowArtifactsDir = path.join(runDir, "artifacts");
          const stepArtifactsDestDir = path.join(workflowArtifactsDir, step.id);
          
          stepResults.set(step.id, {
            output: outputVal,
            artifacts: stepArtifactsDestDir
          });

          // Copy all step execution artifacts into the workflow run's artifacts/<stepId>/ folder genericly
          const stepArtifactsSrcDir = path.join(EXEC_DIR, execId, "artifacts");
          if (fs.existsSync(stepArtifactsSrcDir)) {
            copyDirRecursive(stepArtifactsSrcDir, stepArtifactsDestDir);
          }

          saveWorkflowState(record);
          broadcast(runId, "step_completed", { stepId: step.id, result });
        } else {
          // Execution failed or cancelled
          record.steps[i].status = execRecord.status;
          record.steps[i].endTime = new Date().toISOString();
          record.steps[i].error = execRecord.error || "Step did not complete successfully.";
          saveWorkflowState(record);

          broadcast(runId, "step_failed", {
            stepId: step.id,
            error: record.steps[i].error,
            status: execRecord.status,
          });

          if (execRecord.status === "cancelled") {
            throw new Error(`Step '${step.id}' execution cancelled.`);
          } else {
            throw new Error(`Step '${step.id}' execution failed: ${record.steps[i].error}`);
          }
        }
      }

      // Workflow completed
      record.status = "completed";
      record.endTime = new Date().toISOString();
      record.durationMs = Date.now() - active.startTime;
      saveWorkflowState(record);

      // Collect artifact files to return in metadata
      const generatedFiles: string[] = [];
      const scanDir = (dir: string, prefix = "") => {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === "workflow_state.json" || entry.name === "input.json" || entry.name === "logs") {
            continue;
          }
          const relPath = path.join(prefix, entry.name).replace(/\\/g, "/");
          if (entry.isDirectory()) {
            scanDir(path.join(dir, entry.name), relPath);
          } else {
            generatedFiles.push(relPath);
          }
        }
      };
      scanDir(runDir);

      broadcast(runId, "workflow_completed", { runId, artifacts: generatedFiles });
      this._terminateRun(runId, "completed");

    } catch (err: any) {
      const currentRecord = this.getRun(runId);
      if (currentRecord?.status === "cancelled") {
        broadcast(runId, "workflow_cancelled", { runId });
        this._terminateRun(runId, "cancelled");
        return;
      }

      const msg = err instanceof Error ? err.message : String(err);
      record.status = "failed";
      record.endTime = new Date().toISOString();
      record.durationMs = Date.now() - active.startTime;
      record.error = msg;
      saveWorkflowState(record);

      broadcast(runId, "workflow_failed", { runId, error: msg });
      this._terminateRun(runId, "failed");
    }
  },

  getRun(runId: string): WorkflowRunRecord | undefined {
    const p = path.join(EXEC_DIR, runId, "workflow_state.json");
    if (!fs.existsSync(p)) return undefined;
    try {
      return JSON.parse(fs.readFileSync(p, "utf-8")) as WorkflowRunRecord;
    } catch {
      return undefined;
    }
  },

  streamRun(runId: string, res: Response): boolean {
    const active = activeWorkflowRuns.get(runId);
    if (active) {
      setSseHeaders(res);
      // Replay all buffered events
      for (const ev of active.eventLog) {
        writeSseEvent(res, ev.type, ev.data, runId);
      }
      if (active.finished) {
        if (!res.writableEnded) res.end();
      } else {
        active.consumers.push(res);
        res.on("close", () => {
          const idx = active.consumers.indexOf(res);
          if (idx !== -1) active.consumers.splice(idx, 1);
        });
      }
      return true;
    }

    // Serve completed workflow run details as single event
    const record = this.getRun(runId);
    if (!record) return false;

    setSseHeaders(res);
    if (record.status === "completed") {
      writeSseEvent(res, "workflow_completed", { runId }, runId);
    } else if (record.status === "cancelled") {
      writeSseEvent(res, "workflow_cancelled", { runId }, runId);
    } else {
      writeSseEvent(res, "workflow_failed", { runId, error: record.error }, runId);
    }
    res.end();
    return true;
  },

  cancelRun(runId: string): boolean {
    const active = activeWorkflowRuns.get(runId);
    if (!active || active.finished) return false;

    const record = this.getRun(runId);
    if (!record) return false;

    record.status = "cancelled";
    record.endTime = new Date().toISOString();
    record.durationMs = Date.now() - active.startTime;

    // Find and cancel the currently running step
    for (let i = 0; i < record.steps.length; i++) {
      const step = record.steps[i];
      if (step.status === "running" && step.executionId) {
        executionService.cancel(step.executionId);
        record.steps[i].status = "cancelled";
        record.steps[i].endTime = new Date().toISOString();
      } else if (step.status === "queued") {
        record.steps[i].status = "cancelled";
      }
    }

    saveWorkflowState(record);
    broadcast(runId, "workflow_cancelled", { runId });
    this._terminateRun(runId, "cancelled");
    return true;
  },

  _terminateRun(runId: string, status: "completed" | "failed" | "cancelled"): void {
    const active = activeWorkflowRuns.get(runId);
    if (!active) return;
    active.finished = true;
    activeWorkflowRuns.delete(runId);
    for (const res of active.consumers) {
      if (!res.writableEnded) res.end();
    }
  },
};
