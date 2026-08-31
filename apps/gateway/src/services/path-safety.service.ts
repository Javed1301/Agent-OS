/**
 * Path Safety Service
 *
 * Provides utilities for path containment checks and agent ID validation.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const WORKSPACE_ROOT = process.env["WORKSPACE_ROOT"]
  ? path.resolve(process.env["WORKSPACE_ROOT"])
  : path.resolve(__dirname, "../../../..");

export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(WORKSPACE_ROOT, "data");

/**
 * Validates that an agent ID consists exclusively of lowercase alphanumeric characters and hyphens.
 */
export function isValidAgentId(id: string): boolean {
  if (!id || typeof id !== "string") return false;
  return /^[a-z0-9-]+$/.test(id);
}

/**
 * Safely checks if a candidate path is contained within a root directory,
 * preventing path traversal and prefix-collision vulnerabilities.
 */
export function isPathWithinRoot(candidate: string, root: string): boolean {
  if (!candidate || !root) return false;
  if (candidate.includes("\0")) return false;

  // Reject Windows-style drive/UNC absolute paths on POSIX systems where path.posix.isAbsolute does not catch them
  if (process.platform !== "win32") {
    if (/^[a-zA-Z]:[\\/]|^\\\\/.test(candidate)) {
      return false;
    }
  }

  const absRoot = path.resolve(root);
  const absCandidate = path.resolve(absRoot, candidate);
  const rel = path.relative(absRoot, absCandidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Checks if a candidate path is contained within either WORKSPACE_ROOT or DATA_DIR.
 */
export function isPathWithinAllowedRoots(
  candidate: string,
  allowedRoots: string[] = [WORKSPACE_ROOT, DATA_DIR]
): boolean {
  return allowedRoots.some((root) => isPathWithinRoot(candidate, root));
}
