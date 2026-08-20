/**
 * Registry Router
 *
 * Handles importing external agents from local folder paths.
 * POST /api/registry/import  — register an agent from an absolute folder path
 * GET  /api/registry/external — list all external agent entries
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { registryService } from "../services/registry.service.js";

import { runtimeService } from "../services/runtime.service.js";

export const registryRouter = Router();

// POST /api/registry/import — register an external agent
registryRouter.post("/import", async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const folderPath = typeof body["path"] === "string" ? body["path"].trim() : "";

  if (!folderPath) {
    res.status(400).json({ error: "Request body must include a 'path' field with the absolute folder path." });
    return;
  }

  const result = await registryService.registerExternal(folderPath);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  const agent = result.agent!;
  let dependencyInfo = null;
  let estimatedReuse = false;

  if (agent.workingDirectory) {
    try {
      const dep = runtimeService.detectDependencies(agent.workingDirectory);
      if (dep.sourceType !== "none") {
        const meta = runtimeService.getMetadata(dep.runtimeHash);
        estimatedReuse = !!(meta && meta.state === "available");
        dependencyInfo = {
          sourceType: dep.sourceType,
          packages: dep.packages,
          runtimeHash: dep.runtimeHash,
          estimatedReuse,
          existingRuntimeState: meta ? meta.state : "none",
        };
      }
    } catch {
      /* ignore */
    }
  }

  res.status(201).json({
    message: `Agent '${agent.id}' registered successfully.`,
    agent,
    dependencyInfo,
  });
});

// GET /api/registry/external — list external agents
registryRouter.get("/external", (_req: Request, res: Response) => {
  const entries = registryService.listExternalEntries();
  res.json({ external: entries, count: entries.length });
});
