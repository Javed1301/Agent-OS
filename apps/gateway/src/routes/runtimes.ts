/**
 * Runtimes Router — REST API for Python Runtime Management
 */

import { Router } from "express";
import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { runtimeService } from "../services/runtime.service.js";
import { registryService } from "../services/registry.service.js";

export const runtimesRouter = Router();

// GET /api/runtimes — list all runtimes
runtimesRouter.get("/runtimes", (_req: Request, res: Response) => {
  const runtimes = runtimeService.listRuntimes();
  res.json({ runtimes, count: runtimes.length });
});

// GET /api/runtimes/:hash — get runtime details
runtimesRouter.get("/runtimes/:hash", (req: Request, res: Response) => {
  const hash = String(req.params["hash"]);
  const py = String(req.query["py"] || "py311");
  const meta = runtimeService.getMetadata(hash, py);

  if (!meta) {
    res.status(404).json({ error: `Runtime '${hash}' not found.` });
    return;
  }

  res.json(meta);
});

// GET /api/runtimes/:hash/lockfile — read source lockfile
runtimesRouter.get("/runtimes/:hash/lockfile", (req: Request, res: Response) => {
  const hash = String(req.params["hash"]);
  const py = String(req.query["py"] || "py311");
  const dir = runtimeService.getRuntimeDir(hash, py);
  const sourceLockPath = path.join(dir, "source.lock");

  if (!fs.existsSync(sourceLockPath)) {
    res.status(404).json({ error: `Lockfile for runtime '${hash}' not found.` });
    return;
  }

  const content = fs.readFileSync(sourceLockPath, "utf-8");
  res.json({ hash, content });
});

// POST /api/runtimes/gc — trigger garbage collection
runtimesRouter.post("/runtimes/gc", (_req: Request, res: Response) => {
  const result = runtimeService.runGC();
  res.json({
    message: `Garbage collection complete. Freed ${(result.freedBytes / (1024 * 1024)).toFixed(2)} MB.`,
    ...result,
  });
});

// DELETE /api/runtimes/:hash — delete runtime
runtimesRouter.delete("/runtimes/:hash", (req: Request, res: Response) => {
  const hash = String(req.params["hash"]);
  try {
    const deleted = runtimeService.deleteRuntime(hash);
    if (deleted) {
      res.json({ message: `Runtime '${hash}' deleted successfully.` });
    } else {
      res.status(404).json({ error: `Runtime '${hash}' not found.` });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

// POST /api/agents/:id/runtime/install — install/resolve runtime for agent
runtimesRouter.post("/agents/:id/runtime/install", async (req: Request, res: Response) => {
  const agentId = String(req.params["id"]);
  const agent = registryService.getAgent(agentId);

  if (!agent) {
    res.status(404).json({ error: `Agent '${agentId}' not found.` });
    return;
  }

  try {
    const result = await runtimeService.resolveRuntime(agent.workingDirectory, agent.id, "3.11");
    // Reload registry so agent definition updates
    registryService.reload();
    res.json({
      message: result.message,
      agentId,
      result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Failed to install runtime: ${msg}` });
  }
});

// POST /api/agents/:id/runtime/rebuild — force rebuild runtime for agent
runtimesRouter.post("/agents/:id/runtime/rebuild", async (req: Request, res: Response) => {
  const agentId = String(req.params["id"]);
  const agent = registryService.getAgent(agentId);

  if (!agent) {
    res.status(404).json({ error: `Agent '${agentId}' not found.` });
    return;
  }

  try {
    // Detect current dependencies to get hash
    const depInfo = runtimeService.detectDependencies(agent.workingDirectory);
    if (depInfo.runtimeHash && depInfo.runtimeHash !== "none") {
      try {
        runtimeService.deleteRuntime(depInfo.runtimeHash);
      } catch {
        /* ignore if locked/busy */
      }
    }

    const result = await runtimeService.resolveRuntime(agent.workingDirectory, agent.id, "3.11");
    registryService.reload();

    res.json({
      message: `Runtime rebuilt successfully.`,
      agentId,
      result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Failed to rebuild runtime: ${msg}` });
  }
});
