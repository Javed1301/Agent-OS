/**
 * Shell Router
 *
 * Opens a local folder in the OS file explorer.
 * POST /api/shell/open-folder — body: { path: string }
 *
 * Platform support:
 *   Windows: explorer.exe <path>
 *   macOS:   open <path>
 *   Linux:   xdg-open <path>
 */

import { Router } from "express";
import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { isPathWithinAllowedRoots } from "../services/path-safety.service.js";

export const shellRouter = Router();

// POST /api/shell/open-folder — open a folder in the OS file explorer
shellRouter.post("/open-folder", (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const folderPath = typeof body["path"] === "string" ? body["path"].trim() : "";

  if (!folderPath) {
    res.status(400).json({ error: "Request body must include a 'path' field." });
    return;
  }

  const isDocker = process.env["DOCKER_ENV"] === "true" || fs.existsSync("/.dockerenv");
  if (isDocker) {
    res.json({
      success: false,
      supported: false,
      message: "Folder opening is not supported inside Docker container environments.",
      path: folderPath,
    });
    return;
  }

  const resolvedPath = path.resolve(folderPath);

  if (!isPathWithinAllowedRoots(resolvedPath)) {
    res.status(403).json({ error: "Access denied: path must be within the workspace or data directory." });
    return;
  }

  if (!fs.existsSync(resolvedPath)) {
    res.status(404).json({ error: `Path not found: ${folderPath}` });
    return;
  }

  const platform = process.platform;
  let cmd: string;
  let args: string[];

  if (platform === "win32") {
    cmd = "explorer.exe";
    args = [folderPath];
  } else if (platform === "darwin") {
    cmd = "open";
    args = [folderPath];
  } else {
    cmd = "xdg-open";
    args = [folderPath];
  }

  let responded = false;
  try {
    const child = spawn(cmd, args, {
      detached: true,
      stdio: "ignore",
      shell: false,
    });

    child.on("error", (err) => {
      if (!responded) {
        responded = true;
        res.json({
          success: false,
          supported: false,
          error: `Open folder tool unavailable (${cmd}): ${err.message}`,
        });
      }
    });

    child.unref();
    setTimeout(() => {
      if (!responded) {
        responded = true;
        res.json({ success: true, path: folderPath });
      }
    }, 100);
  } catch (err) {
    if (!responded) {
      responded = true;
      const msg = err instanceof Error ? err.message : String(err);
      res.json({ success: false, supported: false, error: `Failed to open folder: ${msg}` });
    }
  }
});
