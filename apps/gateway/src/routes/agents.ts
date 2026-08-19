import { Router } from "express";
import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { registryService } from "../services/registry.service.js";
import { healthService } from "../services/health.service.js";
import { runtimeService } from "../services/runtime.service.js";
import { environmentResolver } from "../services/environment-resolver.service.js";
import { environmentDiscoveryService } from "../services/discovery.service.js";
import { environmentCompatibilityService } from "../services/compatibility.service.js";

export const agentsRouter = Router();

// GET /api/agents — list all agents
agentsRouter.get("/", (_req: Request, res: Response) => {
  const agents = registryService.listAgents();
  res.json({ agents, count: agents.length });
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

// GET /api/agents/:id/resolve — resolve interpreter & environments diagnostics
agentsRouter.get("/:id/resolve", async (req: Request, res: Response) => {
  const agentId = String(req.params["id"]);
  const agent = registryService.getAgent(agentId);

  if (!agent) {
    res.status(404).json({ error: `Agent '${agentId}' not found.` });
    return;
  }

  try {
    const resResult = await environmentResolver.resolve(
      agent.id,
      agent.logicalPath || agent.workingDirectory,
      agent.entrypoint
    );
    const { sourceRoot, dependencyDescriptor, descriptorPath } = resResult.resolvedSource;

    let requirementsContent = "";
    if (descriptorPath && fs.existsSync(descriptorPath)) {
      requirementsContent = fs.readFileSync(descriptorPath, "utf-8");
    }

    const candidates = await environmentDiscoveryService.discover(sourceRoot);
    const compatibleCandidates = [];
    const candidatesDetails = [];

    for (const env of candidates) {
      const report = environmentCompatibilityService.evaluate(
        env,
        requirementsContent,
        dependencyDescriptor,
        "3.11"
      );
      candidatesDetails.push({
        id: env.id,
        type: env.type,
        pythonVersion: env.pythonVersion,
        executablePath: env.executablePath,
        discoveredFrom: env.discoveredFrom,
        compatibility: {
          compatible: report.compatible,
          score: report.score,
          reason: report.reason,
          missingPackages: report.missingPackages,
          versionMismatches: report.versionMismatches,
        }
      });
      if (report.compatible) {
        compatibleCandidates.push({
          id: env.id,
          type: env.type,
          pythonVersion: env.pythonVersion,
          executablePath: env.executablePath,
          discoveredFrom: env.discoveredFrom,
          score: report.score,
        });
      }
    }

    res.json({
      agent: {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        entrypoint: agent.entrypoint,
      },
      source: {
        sourceRoot,
        dependencyDescriptor,
        descriptorPath,
      },
      requirements: requirementsContent.trim().split("\n").map(l => l.trim()).filter(Boolean),
      candidates: candidatesDetails,
      compatibleCandidates,
      selectedEnvironment: resResult.environment ? {
        id: resResult.environment.id,
        type: resResult.environment.type,
        pythonVersion: resResult.environment.pythonVersion,
        executablePath: resResult.environment.executablePath,
      } : null,
      action: resResult.action,
      reason: resResult.reason,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Failed to resolve agent environment: ${msg}` });
  }
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

// POST /api/agents/reload — hot-reload the agent registry from disk
agentsRouter.post("/reload", async (_req: Request, res: Response) => {
  await registryService.reload();
  const agents = registryService.listAgents();
  res.json({ message: "Registry reloaded.", count: agents.length, agents: agents.map((a) => a.id) });
});

// POST /api/agents/import — product-grade import of external agent
agentsRouter.post("/import", async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const folderPath = typeof body["path"] === "string" ? body["path"].trim() : "";

  if (!folderPath) {
    res.status(400).json({ error: "Request body must include a 'path' field with the source folder path." });
    return;
  }

  const result = await registryService.importAgent(folderPath);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  const agent = result.agent!;
  let dependencyInfo = null;

  if (agent.workingDirectory) {
    try {
      const dep = runtimeService.detectDependencies(agent.workingDirectory);
      if (dep.sourceType !== "none") {
        const meta = runtimeService.getMetadata(dep.runtimeHash);
        dependencyInfo = {
          sourceType: dep.sourceType,
          packages: dep.packages,
          runtimeHash: dep.runtimeHash,
          estimatedReuse: !!(meta && meta.state === "available"),
          existingRuntimeState: meta ? meta.state : "none",
        };
      }
    } catch {
      /* ignore */
    }
  }

  res.status(201).json({
    message: `Agent '${agent.id}' imported successfully.`,
    agent,
    dependencyInfo,
  });
});

// POST /api/agents/:id/create-requirements — create initial requirements.txt
agentsRouter.post("/:id/create-requirements", async (req: Request, res: Response) => {
  const agentId = String(req.params["id"]);
  const agent = registryService.getAgent(agentId);

  if (!agent) {
    res.status(404).json({ error: `Agent '${agentId}' not found.` });
    return;
  }

  const reqPath = path.join(agent.workingDirectory, "requirements.txt");
  if (fs.existsSync(reqPath)) {
    res.status(400).json({ error: "requirements.txt already exists for this agent." });
    return;
  }

  try {
    fs.mkdirSync(agent.workingDirectory, { recursive: true });
    const content = `# Python dependencies for ${agent.name}\n# Add required packages below, e.g.:\n# crewai\n# langchain\n`;
    fs.writeFileSync(reqPath, content, "utf-8");

    await registryService.reload();

    res.json({
      message: "requirements.txt created successfully.",
      agentId,
      path: reqPath,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Failed to create requirements.txt: ${msg}` });
  }
});

// GET /api/registry/diagnostics — registry & runtime diagnostics
agentsRouter.get("/registry/diagnostics", (_req: Request, res: Response) => {
  const agents = registryService.listAgents();
  const workspaceAgents = agents.filter((a) => a.source === "workspace" && !a.isExternal);
  const importedAgents = agents.filter((a) => a.source === "imported" || a.isExternal);

  const runtimes = runtimeService.listRuntimes();
  const managedRuntimes = runtimes.filter((r) => r.state === "available");
  const staleRuntimes = runtimes.filter((r) => r.state === "stale");
  const fallbackCount = agents.filter((a) => !a.runtime || a.runtime.hash === "none").length;

  res.json({
    totalAgents: agents.length,
    workspaceAgents: workspaceAgents.length,
    importedAgents: importedAgents.length,
    duplicateIds: registryService.getDuplicateIds(),
    runtimeStats: {
      totalRuntimes: runtimes.length,
      managedRuntimes: managedRuntimes.length,
      staleRuntimes: staleRuntimes.length,
      fallbackCount,
    },
  });
});

// POST /api/agents/:id/runtime/rescan — force rescan of agent dependencies
agentsRouter.post("/:id/runtime/rescan", async (req: Request, res: Response) => {
  const agentId = String(req.params["id"]);
  const agent = registryService.getAgent(agentId);

  if (!agent) {
    res.status(404).json({ error: `Agent '${agentId}' not found.` });
    return;
  }

  await registryService.reload();
  const updated = registryService.getAgent(agentId)!;
  const health = await healthService.checkAgent(updated);

  res.json({
    message: `Rescanned dependencies for '${agentId}'.`,
    agent: updated,
    health,
  });
});
