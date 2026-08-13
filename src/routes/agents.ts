import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { registryService } from "../services/registry.service.js";
import { healthService } from "../services/health.service.js";
import type { AgentDefinition } from "../types/agent.js";

export const agentsRouter = Router();

// GET /api/agents — list all agents
agentsRouter.get("/", (_req: Request, res: Response) => {
  const agents = registryService.listAgents();
  res.json({ agents });
});

// GET /api/agents/:id — get single agent
agentsRouter.get("/:id", (req: Request, res: Response) => {
  const agent = registryService.getAgent(String(req.params["id"]));
  if (!agent) {
    res.status(404).json({ error: `Agent '${req.params["id"]}' not found.` });
    return;
  }
  res.json(agent);
});

// GET /api/agents/:id/health — run health check on demand
agentsRouter.get("/:id/health", async (req: Request, res: Response) => {
  const agent = registryService.getAgent(String(req.params["id"]));
  if (!agent) {
    res.status(404).json({ error: `Agent '${req.params["id"]}' not found.` });
    return;
  }
  const result = await healthService.checkAgent(agent);
  res.json(result);
});

// POST /api/agents — register a new agent
agentsRouter.post("/", (req: Request, res: Response) => {
  try {
    const agent = registryService.addAgent(req.body as AgentDefinition);
    res.status(201).json(agent);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(409).json({ error: msg });
  }
});

// PUT /api/agents/:id — update agent
agentsRouter.put("/:id", (req: Request, res: Response) => {
  try {
    const agent = registryService.updateAgent(String(req.params["id"]), req.body as Partial<AgentDefinition>);
    res.json(agent);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(404).json({ error: msg });
  }
});

// DELETE /api/agents/:id — remove agent
agentsRouter.delete("/:id", (req: Request, res: Response) => {
  try {
    registryService.removeAgent(String(req.params["id"]));
    res.status(204).send();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(404).json({ error: msg });
  }
});

// Unused next — suppress TS warning
void ((_: NextFunction) => {});
