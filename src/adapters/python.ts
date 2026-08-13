import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import treeKill from "tree-kill";
import type { Adapter, AdapterContext, AdapterHandle } from "./base.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNNER_PATH = path.resolve(__dirname, "../templates/runner.py");

/**
 * PythonSubprocessAdapter
 *
 * Spawns `runner.py --mode <agentId> --inputs <json> --output-dir <dir>`
 * using the agent's specific venv interpreter.
 *
 * Reads JSON-line events from stdout and relays them to the SSE stream.
 * stderr lines are captured as log events.
 *
 * Cancellation uses tree-kill (taskkill /F /T /PID on Windows) to terminate
 * the entire process tree including any CrewAI child processes.
 */
export const pythonAdapter: Adapter = {
  start(ctx: AdapterContext): AdapterHandle {
    const { execution, agent, sseRes, appendLog, outputDir, spawnEnv } = ctx;

    const interpreterPath = agent.interpreterPath;
    if (!interpreterPath) {
      throw new Error(`Agent '${agent.id}' has no interpreterPath configured.`);
    }

    const inputsJson = JSON.stringify(execution.input);

    const child = spawn(
      interpreterPath,
      [RUNNER_PATH, "--mode", agent.id, "--inputs", inputsJson, "--output-dir", outputDir],
      {
        cwd: agent.workingDirectory,
        env: spawnEnv,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      }
    );

    // Helper: emit a structured SSE event to the client
    function emit(type: string, data: unknown): void {
      if (sseRes.writableEnded) return;
      const event = JSON.stringify({ type, data, executionId: execution.id, timestamp: new Date().toISOString() });
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
          // Not JSON — relay as a raw log event
          emit("log", line);
        }
      }
    });

    // Stderr: capture as error log events
    child.stderr?.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        appendLog(`[stderr] ${line}`);
        emit("log", `[stderr] ${line}`);
      }
    });

    // Handle process exit
    child.on("close", (code, signal) => {
      // Flush any remaining buffered stdout
      if (stdoutBuffer.trim()) {
        appendLog(`[stdout] ${stdoutBuffer}`);
        emit("log", stdoutBuffer);
      }
      // The execution.service.ts close handler manages status transitions and SSE close.
      // We just emit the exit code here for debugging.
      appendLog(`[exit] code=${code ?? "null"} signal=${signal ?? "null"}`);
    });

    return {
      cancel(): void {
        if (child.pid != null) {
          treeKill(child.pid, "SIGKILL");
        }
      },
    };
  },
};
