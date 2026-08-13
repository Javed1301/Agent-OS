/**
 * Process Service — Resilient process inspection & child process tree management.
 *
 * Ensures system diagnostic commands (like `ps`) never crash the gateway
 * process even if `procps` or OS utilities are missing or degraded.
 */

import { spawn } from "node:child_process";
import treeKill from "tree-kill";

let _psAvailable: boolean | null = null;

/**
 * Check if the `ps` command-line utility is installed and available.
 * Returns true if ps runs without error, false otherwise.
 * Never throws.
 */
export async function checkPsAvailable(): Promise<boolean> {
  if (_psAvailable !== null) return _psAvailable;

  return new Promise((resolve) => {
    try {
      const child = spawn("ps", ["-A"], { stdio: "ignore" });
      child.on("error", () => {
        _psAvailable = false;
        resolve(false);
      });
      child.on("close", (code) => {
        _psAvailable = code === 0;
        resolve(code === 0);
      });
    } catch {
      _psAvailable = false;
      resolve(false);
    }
  });
}

/**
 * Safely list child process IDs for a given parent PID.
 * Uses `ps` when available. Returns `[]` on failure.
 * Never throws.
 */
export async function listChildProcesses(parentPid: number): Promise<number[]> {
  const isPsAvailable = await checkPsAvailable();
  if (!isPsAvailable) {
    return [];
  }

  return new Promise((resolve) => {
    try {
      const child = spawn("ps", ["-o", "pid,ppid", "-ax"]);
      let stdout = "";

      child.on("error", (err) => {
        console.warn(`[process] ps command unavailable: ${err.message}`);
        resolve([]);
      });

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.on("close", (code) => {
        if (code !== 0) {
          resolve([]);
          return;
        }

        const childPids: number[] = [];
        const lines = stdout.split("\n");
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 2) {
            const pid = parseInt(parts[0], 10);
            const ppid = parseInt(parts[1], 10);
            if (!isNaN(pid) && !isNaN(ppid) && ppid === parentPid) {
              childPids.push(pid);
            }
          }
        }
        resolve(childPids);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[process] Error running listChildProcesses: ${msg}`);
      resolve([]);
    }
  });
}

/**
 * Safely kill a process and its child process tree.
 * Never throws.
 */
export function safeTreeKill(pid: number, signal: string | number = "SIGKILL"): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      treeKill(pid, signal, (err) => {
        if (err) {
          console.warn(`[process] treeKill warning for PID ${pid}: ${err.message}`);
        }
        resolve(!err);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[process] Exception in treeKill for PID ${pid}: ${msg}`);
      resolve(false);
    }
  });
}

export const processService = {
  checkPsAvailable,
  listChildProcesses,
  safeTreeKill,
};
