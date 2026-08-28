import { Router } from "express";
import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { registryService } from "../services/registry.service.js";
import { executionService } from "../services/execution.service.js";
import { storeRepository } from "../repositories/index.js";
import { validateAgentInput } from "../services/validation.service.js";

export const executionsRouter = Router();

// POST /api/agents/:id/execute — start an execution, return executionId
executionsRouter.post("/agents/:id/execute", async (req: Request, res: Response) => {
  const agent = registryService.getAgent(String(req.params["id"]));
  if (!agent) {
    res.status(404).json({ error: `Agent '${req.params["id"]}' not found.` });
    return;
  }
  try {
    const input = req.body;
    const validation = validateAgentInput(agent, input);
    if (!validation.valid) {
      res.status(400).json({
        error: "Invalid execution input payload.",
        details: validation.errors,
      });
      return;
    }
    const executionId = await executionService.execute(agent, input as Record<string, unknown>);
    res.status(202).json({ executionId, agentId: agent.id, status: "queued" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/executions/:id/stream — SSE stream for a running execution
executionsRouter.get("/executions/:id/stream", async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const found = await executionService.streamExecution(id, res);
  if (!found) {
    res.status(404).json({ error: `Execution '${id}' not found.` });
  }
});

// POST /api/executions/:id/cancel — cancel a running execution
executionsRouter.post("/executions/:id/cancel", (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const cancelled = executionService.cancel(id);
  if (!cancelled) {
    res.status(404).json({ error: `Execution '${id}' not found or not running.` });
    return;
  }
  res.json({ executionId: id, status: "cancelled" });
});

// GET /api/executions — list execution history (optional ?agentId= filter)
executionsRouter.get("/executions", async (req: Request, res: Response) => {
  const agentId = req.query["agentId"] as string | undefined;
  const entries = await storeRepository.list(agentId);
  res.json({ executions: entries, count: entries.length });
});

// GET /api/executions/:id — get execution detail
executionsRouter.get("/executions/:id", async (req: Request, res: Response) => {
  const record = await storeRepository.getById(String(req.params["id"]));
  if (!record) {
    res.status(404).json({ error: `Execution '${req.params["id"]}' not found.` });
    return;
  }
  res.json(record);
});

// GET /api/executions/:id/logs — read raw log file
executionsRouter.get("/executions/:id/logs", async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const record = await storeRepository.getById(id);
  if (!record) {
    res.status(404).json({ error: `Execution '${id}' not found.` });
    return;
  }
  const logPath = storeRepository.getLogPath(id);
  if (!fs.existsSync(logPath)) {
    res.json({ executionId: id, logs: "" });
    return;
  }
  const logs = fs.readFileSync(logPath, "utf-8");
  res.json({ executionId: id, logs });
});

// GET /api/executions/:id/artifacts — list artifact files in the run directory
executionsRouter.get("/executions/:id/artifacts", async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const record = await storeRepository.getById(id);
  if (!record) {
    res.status(404).json({ error: `Execution '${id}' not found.` });
    return;
  }
  const runDir = storeRepository.getRunDir(id);
  const artifactsDir = path.join(runDir, "artifacts");
  const artifacts: string[] = [];

  const scanDir = (dir: string, prefix = "") => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = path.join(prefix, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        scanDir(path.join(dir, entry.name), relPath);
      } else {
        artifacts.push(relPath);
      }
    }
  };

  try {
    scanDir(artifactsDir);
    res.json({ executionId: id, artifacts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
