import { Router } from "express";
import type { Request, Response } from "express";
import { secretsService } from "../services/secrets.service.js";

export const secretsRouter = Router();

// GET /api/secrets — list secret metadata ONLY (never returns secret values)
secretsRouter.get("/", (_req: Request, res: Response) => {
  const secrets = secretsService.listMetadata();
  res.json({ secrets, count: secrets.length });
});

// POST /api/secrets — store an encrypted secret in vault
secretsRouter.post("/", (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const name = typeof body["name"] === "string" ? body["name"].trim() : "";
  const value = typeof body["value"] === "string" ? body["value"].trim() : "";

  if (!name || !value) {
    res.status(400).json({ error: "Request body must include 'name' and 'value' fields." });
    return;
  }

  secretsService.setSecret(name, value);
  res.status(201).json({
    success: true,
    message: `Secret '${name}' saved securely in encrypted vault.`,
    name: name.toUpperCase(),
  });
});

// DELETE /api/secrets/:name — remove secret from vault
secretsRouter.delete("/:name", (req: Request, res: Response) => {
  const name = String(req.params["name"]).trim();
  if (!name) {
    res.status(400).json({ error: "Secret name parameter is required." });
    return;
  }

  const deleted = secretsService.deleteSecret(name);
  if (!deleted) {
    res.status(404).json({ error: `Secret '${name}' not found in vault.` });
    return;
  }

  res.json({ success: true, message: `Secret '${name}' removed.`, name: name.toUpperCase() });
});
