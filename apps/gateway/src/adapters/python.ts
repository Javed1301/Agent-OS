/**
 * PythonSubprocessAdapter
 *
 * Spawns runner.py with:
 *   python runner.py --mode <agentId> --inputs <json> --run-dir <runDir>
 *
 * runner.py lives at: <workspace-root>/scripts/runner.py
 *
 * Reads JSON-line events from stdout and relays them to the SSE stream.
 * stderr lines are captured as log events.
 *
 * Cancellation uses tree-kill (taskkill /F /T /PID on Windows) to terminate
 * the entire process tree including any CrewAI child processes.
 *
 * Implements the unified AgentAdapter interface.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import treeKill from "tree-kill";
import type { AgentAdapter, AdapterContext, AdapterHandle, AdapterHealth } from "./base.js";
import type { AgentDefinition } from "../types/agent.js";
import { safeTreeKill } from "../services/process.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Workspace root override for Docker or 4 levels up from apps/gateway/src/adapters/
const WORKSPACE_ROOT = process.env["WORKSPACE_ROOT"]
  ? path.resolve(process.env["WORKSPACE_ROOT"])
  : path.resolve(__dirname, "../../../..");
const RUNNER_PATH = path.join(WORKSPACE_ROOT, "scripts", "runner.py");

export const pythonAdapter: AgentAdapter = {
  execute(ctx: AdapterContext): AdapterHandle {
    const { execution, agent, sseRes, appendLog, runDir, spawnEnv } = ctx;

    const interpreterPath = agent.interpreterPath;
    if (!interpreterPath) {
      throw new Error(`Agent '${agent.id}' has no resolved interpreter. Check working directory for .venv311, .venv, or venv.`);
    }

    const inputsJson = JSON.stringify(execution.input);

    appendLog(`[execution] Using interpreter ${interpreterPath}`);
    appendLog(`[execution] Spawning process ${execution.id}`);
    emit("log", `[execution] Using interpreter ${interpreterPath}`);
    emit("log", `[execution] Spawning process ${execution.id}`);

    const child = spawn(
      interpreterPath,
      ["-u", RUNNER_PATH, "--mode", agent.canonicalId || agent.id, "--inputs", inputsJson, "--run-dir", runDir],
      {
        cwd: agent.workingDirectory,
        env: spawnEnv,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      }
    );

    if (child.pid) {
      const pidLog = `[agent-os] Process started (pid=${child.pid})`;
      appendLog(`[execution] Spawned pid=${child.pid}`);
      appendLog(pidLog);
      emit("log", `[execution] Spawned pid=${child.pid}`);
      emit("log", pidLog);
    }

    child.on("error", (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      appendLog(`[exec] Error spawning process: ${msg}`);
      emit("log", `[exec] Error spawning process: ${msg}`);
      emit("error", `Failed to spawn interpreter process (${interpreterPath}): ${msg}`);
      emit("status", "failed");
    });

    function emit(type: string, data: unknown): void {
      if (sseRes.writableEnded) return;
      const event = JSON.stringify({
        type,
        data,
        executionId: execution.id,
        timestamp: new Date().toISOString(),
      });
      sseRes.write(`data: ${event}\n\n`);
    }

    // Stdout: JSON-line events from runner.py
    let stdoutBuffer = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        appendLog(`[stdout] ${line}`);
        try {
          const parsed = JSON.parse(line) as { type: string; data: unknown };
          emit(parsed.type, parsed.data);
        } catch {
          emit("log", line);
        }
      }
    });

    // Stderr: capture as log events
    child.stderr?.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        appendLog(`[stderr] ${line}`);
        emit("log", `[stderr] ${line}`);
      }
    });

    child.on("close", (code, signal) => {
      if (stdoutBuffer.trim()) {
        appendLog(`[stdout] ${stdoutBuffer}`);
        emit("log", stdoutBuffer);
      }
      appendLog(`[exit] code=${code ?? "null"} signal=${signal ?? "null"}`);
    });

    return {
      cancel(): void {
        if (child.pid != null) {
          safeTreeKill(child.pid, "SIGKILL");
        }
      },
    };
  },

  async health(agent: AgentDefinition): Promise<AdapterHealth> {
    const interpreterPath = agent.interpreterPath;
    if (!interpreterPath) {
      return {
        status: "misconfigured",
        detail: "No interpreter resolved. Check working directory for .venv311, .venv, or venv.",
      };
    }
    return {
      status: "available",
      detail: `Interpreter resolved: ${interpreterPath}`,
      interpreterPath,
    };
  },
};
