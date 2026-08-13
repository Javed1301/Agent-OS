import { Router } from "express";
import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { workflowsEngine } from "../workflows/engine.js";
import { registryService } from "../services/registry.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../../../..");
const EXEC_DIR = path.join(WORKSPACE_ROOT, "data", "executions");

export const workflowsRouter = Router();

// GET /api/workflows — List all workflows
workflowsRouter.get("/workflows", (req: Request, res: Response) => {
  const list = workflowsEngine.listWorkflows();
  res.json({ workflows: list, count: list.length });
});

// POST /api/workflows — Create workflow manifest
workflowsRouter.post("/workflows", (req: Request, res: Response) => {
  try {
    const { id, name, description, steps } = req.body ?? {};

    // 1. Validation
    if (!id || typeof id !== "string") {
      res.status(400).json({ error: "Workflow ID is required." });
      return;
    }
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "Workflow Name is required." });
      return;
    }
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      res.status(400).json({ error: "Workflow must contain at least one step." });
      return;
    }

    // validate format: id must match ^[a-z0-9-]+$
    const idRegex = /^[a-z0-9-]+$/;
    if (!idRegex.test(id)) {
      res.status(400).json({ error: "Workflow ID must be lowercase alphanumeric and can contain hyphens (e.g. 'my-workflow-1')." });
      return;
    }

    // check duplicate: in-memory catalog and file on disk
    const existing = workflowsEngine.getWorkflow(id);
    const workflowsDir = path.join(WORKSPACE_ROOT, "workflows");
    const targetFile = path.join(workflowsDir, `${id}.yaml`);

    if (existing || fs.existsSync(targetFile)) {
      res.status(409).json({ error: `Workflow with ID '${id}' already exists.` });
      return;
    }

    // check step ids uniqueness and agent existence
    const stepIds = new Set<string>();
    for (const step of steps) {
      if (!step.id || typeof step.id !== "string") {
        res.status(400).json({ error: "Each step must have a unique ID." });
        return;
      }
      if (stepIds.has(step.id)) {
        res.status(400).json({ error: `Duplicate step ID '${step.id}' found.` });
        return;
      }
      stepIds.add(step.id);

      if (!step.agent || typeof step.agent !== "string") {
        res.status(400).json({ error: `Step '${step.id}' must specify an agent.` });
        return;
      }
      const agentExists = registryService.getAgent(step.agent);
      if (!agentExists) {
        res.status(400).json({ error: `Agent '${step.agent}' referenced in step '${step.id}' does not exist.` });
        return;
      }
    }

    // 2. Generate YAML using js-yaml
    const manifest = {
      name,
      version: "1.0.0",
      description: description ?? "",
      steps: steps.map((s) => ({
        id: s.id,
        agent: s.agent,
        input: s.input ?? {},
      })),
    };

    const yamlStr = yaml.dump(manifest, { indent: 2, noRefs: true });

    // 3. Save to workflows/<id>.yaml
    if (!fs.existsSync(workflowsDir)) {
      fs.mkdirSync(workflowsDir, { recursive: true });
    }
    fs.writeFileSync(targetFile, yamlStr, "utf-8");

    // 4. Reload workflow catalog
    workflowsEngine.load();

    // 5. Return 201 with metadata
    res.status(201).json({
      id,
      name,
      version: "1.0.0",
      description: manifest.description,
      steps: manifest.steps,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to create workflow: ${err.message}` });
  }
});

// GET /api/workflow-runs — List all workflow run states
workflowsRouter.get("/workflow-runs", (req: Request, res: Response) => {
  if (!fs.existsSync(EXEC_DIR)) {
    res.json({ runs: [], count: 0 });
    return;
  }
  try {
    const dirs = fs.readdirSync(EXEC_DIR);
    const runs: any[] = [];
    for (const dirName of dirs) {
      if (dirName.startsWith("wf_")) {
        const statePath = path.join(EXEC_DIR, dirName, "workflow_state.json");
        if (fs.existsSync(statePath)) {
          try {
            const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
            runs.push(state);
          } catch {}
        }
      }
    }
    // Sort by startTime descending (newest first)
    runs.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    res.json({ runs, count: runs.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workflows/:id/run — Start workflow run
workflowsRouter.post("/workflows/:id/run", async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const workflow = workflowsEngine.getWorkflow(id);
  if (!workflow) {
    res.status(404).json({ error: `Workflow '${id}' not found.` });
    return;
  }

  try {
    const input = (req.body as Record<string, unknown>) ?? {};
    const runId = await workflowsEngine.runWorkflow(id, input);
    res.status(202).json({ runId, workflowId: id, status: "running" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workflow-runs/:id — Get details/status of a run
workflowsRouter.get("/workflow-runs/:id", (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const record = workflowsEngine.getRun(id);
  if (!record) {
    res.status(404).json({ error: `Workflow run '${id}' not found.` });
    return;
  }
  res.json(record);
});

// GET /api/workflow-runs/:id/stream — SSE stream
workflowsRouter.get("/workflow-runs/:id/stream", (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const success = workflowsEngine.streamRun(id, res);
  if (!success) {
    res.status(404).json({ error: `Workflow run '${id}' not active or not found.` });
  }
});

// POST /api/workflow-runs/:id/cancel — Cancel running workflow
workflowsRouter.post("/workflow-runs/:id/cancel", (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const success = workflowsEngine.cancelRun(id);
  if (!success) {
    res.status(404).json({ error: `Workflow run '${id}' not found, or already finished.` });
    return;
  }
  res.json({ runId: id, status: "cancelled" });
});

const listArtifacts = (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const runDir = path.join(EXEC_DIR, id);
  if (!fs.existsSync(runDir)) {
    res.status(404).json({ error: `Workflow run '${id}' not found.` });
    return;
  }
  const artifacts: string[] = [];
  const scanDir = (dir: string, prefix = "") => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      // Exclude state metadata and logs folder/files
      if (
        entry.name === "workflow_state.json" ||
        entry.name === "input.json" ||
        entry.name === "logs" ||
        entry.name === "logs.txt"
      ) {
        continue;
      }
      const relPath = path.join(prefix, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        scanDir(path.join(dir, entry.name), relPath);
      } else {
        artifacts.push(relPath);
      }
    }
  };
  try {
    scanDir(runDir);
    res.json({ runId: id, artifacts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

const getLanguageFromExtension = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".py":
      return "python";
    case ".md":
      return "markdown";
    case ".json":
      return "json";
    case ".yaml":
    case ".yml":
      return "yaml";
    case ".txt":
      return "plaintext";
    default:
      return "plaintext";
  }
};

const getArtifact = (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  // The wildcard path matches everything after /artifacts/
  let relPath = req.params["path"];
  if (Array.isArray(relPath)) {
    relPath = relPath.join("/");
  }
  if (!relPath) {
    res.status(400).json({ error: "Missing artifact path." });
    return;
  }

  const baseDir = path.resolve(EXEC_DIR, id);
  const filePath = path.resolve(baseDir, relPath);

  // Prevent directory traversal attacks
  if (!filePath.startsWith(baseDir)) {
    res.status(403).json({ error: "Access denied: outside workflow directory." });
    return;
  }

  // Validate the path extension
  const allowedExtensions = [".py", ".md", ".txt", ".json", ".yaml", ".yml"];
  const ext = path.extname(filePath).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    res.status(400).json({ error: `File type '${ext}' is not supported.` });
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.status(404).json({ error: `Artifact '${relPath}' not found.` });
    return;
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const language = getLanguageFromExtension(filePath);
    res.json({
      path: relPath,
      content,
      language
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to read file: ${err.message}` });
  }
};

// List artifacts
workflowsRouter.get("/workflow-runs/:id/artifacts", listArtifacts);

// Read artifact content (supports nested paths)
workflowsRouter.get("/workflow-runs/:id/artifacts/*path", getArtifact);

