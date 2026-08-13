import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import type { WorkflowDefinition } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = process.env["WORKSPACE_ROOT"]
  ? path.resolve(process.env["WORKSPACE_ROOT"])
  : path.resolve(__dirname, "../../../..");
const WORKFLOWS_DIR = path.join(WORKSPACE_ROOT, "workflows");

export function loadWorkflows(): WorkflowDefinition[] {
  const discovered: WorkflowDefinition[] = [];

  if (!fs.existsSync(WORKFLOWS_DIR)) {
    console.warn(`[workflows] workflows/ directory not found at: ${WORKFLOWS_DIR}`);
    return discovered;
  }

  try {
    const files = fs.readdirSync(WORKFLOWS_DIR);
    for (const file of files) {
      if (!file.endsWith(".yaml") && !file.endsWith(".yml")) continue;
      const filePath = path.join(WORKFLOWS_DIR, file);

      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const data = yaml.load(raw) as any;

        if (!data || !data.name || !Array.isArray(data.steps)) {
          console.warn(`[workflows] Skipping invalid workflow ${file}: missing name or steps.`);
          continue;
        }

        const id = path.basename(file, path.extname(file));
        discovered.push({
          id,
          name: data.name,
          version: data.version ?? "1.0.0",
          description: data.description ?? "",
          steps: data.steps,
        });
        console.log(`[workflows] Loaded workflow: ${id} from ${filePath}`);
      } catch (err: any) {
        console.error(`[workflows] Failed to parse workflow file ${file}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error(`[workflows] Failed to read workflows directory:`, err.message);
  }

  return discovered;
}
