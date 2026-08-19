import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { agentSourceResolver, ResolvedSource } from "./source-resolver.service.js";
import { environmentDiscoveryService, PythonEnvironment } from "./discovery.service.js";
import { environmentCompatibilityService } from "./compatibility.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = process.env["WORKSPACE_ROOT"]
  ? path.resolve(process.env["WORKSPACE_ROOT"])
  : path.resolve(__dirname, "../../../..");

const LOCAL_MAPPINGS_PATH = path.join(WORKSPACE_ROOT, "data", "registry", "source-mappings.local.json");

export interface ResolutionResult {
  action: "REUSE_EXISTING" | "CREATE_MANAGED_RUNTIME";
  executablePath: string;
  resolvedSource: ResolvedSource;
  environment?: PythonEnvironment;
  reason: string;
}

export const environmentResolver = {
  /**
   * Resolves the best Python environment for a given agent.
   */
  async resolve(
    agentId: string,
    manifestWd?: string,
    manifestEntrypoint?: string,
    pythonVersion = "3.11"
  ): Promise<ResolutionResult> {
    const startTime = Date.now();

    // 1. Resolve agent actual sourceRoot
    const resolvedSource = agentSourceResolver.resolve(agentId, manifestWd, manifestEntrypoint);
    const { sourceRoot, dependencyDescriptor, descriptorPath } = resolvedSource;

    // 2. Read requirements contents
    let requirementsContent = "";
    if (descriptorPath && fs.existsSync(descriptorPath)) {
      try {
        requirementsContent = fs.readFileSync(descriptorPath, "utf-8");
      } catch (err) {
        console.warn(`[environment-resolver] Failed to read descriptor: ${err}`);
      }
    }

    // 3. Discover candidates
    const candidates = await environmentDiscoveryService.discover(sourceRoot);

    // 4. Evaluate compatibility
    const compatibleCandidates: Array<{ env: PythonEnvironment; score: number; priority: number }> = [];

    // Check if there is an explicit interpreter configured in local mappings
    let explicitInterpreter = "";
    if (fs.existsSync(LOCAL_MAPPINGS_PATH)) {
      try {
        const mappings = JSON.parse(fs.readFileSync(LOCAL_MAPPINGS_PATH, "utf-8"));
        const resolvedId = agentId === "hate-speech-detector" ? "hate-speech" : agentId;
        if (mappings[resolvedId]?.interpreterPath) {
          explicitInterpreter = path.resolve(mappings[resolvedId].interpreterPath).replace(/\\/g, "/");
        }
      } catch { /* ignore */ }
    }

    for (const env of candidates) {
      const report = environmentCompatibilityService.evaluate(
        env,
        requirementsContent,
        dependencyDescriptor,
        pythonVersion
      );

      if (report.compatible) {
        // Calculate ranking priority
        let priority = 0;
        const normExec = env.executablePath.replace(/\\/g, "/");

        if (explicitInterpreter && normExec === explicitInterpreter) {
          priority = 100; // Explicitly mapped
        } else if (env.type === "venv" && env.environmentRoot && env.environmentRoot.startsWith(sourceRoot)) {
          priority = 90; // Project-local
        } else if (env.type === "venv" && env.discoveredFrom.includes("Parent Project")) {
          priority = 80; // Parent project local
        } else if (env.type === "managed") {
          priority = 70; // Existing Agent OS managed runtime
        } else if (env.type === "conda") {
          priority = 60; // Conda env
        } else if (env.type === "venv") {
          priority = 50; // Other local venv
        } else if (env.type === "system") {
          priority = 40; // System Python
        }

        compatibleCandidates.push({
          env,
          score: report.score,
          priority,
        });
      }
    }

    // 5. Select best candidate
    // Sort primarily by priority (resolution model) descending, and then by compatibility score descending
    compatibleCandidates.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return b.score - a.score;
    });

    const totalTimeMs = Date.now() - startTime;

    if (compatibleCandidates.length > 0) {
      const selected = compatibleCandidates[0].env;
      const reason = `Found compatible environment. Discovered ${candidates.length} candidates, ${compatibleCandidates.length} compatible. Best: ${selected.id} via priority mapping.`;

      // Log decision (as requested in Section 16 of spec)
      console.log(`[environment] Agent: ${agentId}`);
      console.log(`[environment] Source: ${sourceRoot}`);
      console.log(`[environment] Python requirement: ${pythonVersion}`);
      console.log(`[environment] Dependencies: ${dependencyDescriptor || "none"}`);
      console.log(`[environment] Candidates found: ${candidates.length}`);
      console.log(`[environment] Compatible candidates: ${compatibleCandidates.length}`);
      console.log(`[environment] Selected: ${selected.id} (${selected.type})`);
      console.log(`[environment] Interpreter: ${selected.executablePath}`);
      console.log(`[environment] Action: REUSE_EXISTING`);

      return {
        action: "REUSE_EXISTING",
        executablePath: selected.executablePath,
        resolvedSource,
        environment: selected,
        reason,
      };
    }

    // No compatible environment found -> Falling back to CREATE_MANAGED_RUNTIME
    const reason = `No compatible local environment found. Falling back to creating managed runtime using uv.`;
    console.log(`[environment] Agent: ${agentId}`);
    console.log(`[environment] Source: ${sourceRoot}`);
    console.log(`[environment] Python requirement: ${pythonVersion}`);
    console.log(`[environment] Dependencies: ${dependencyDescriptor || "none"}`);
    console.log(`[environment] Candidates found: ${candidates.length}`);
      console.log(`[environment] Compatible candidates: 0`);
    console.log(`[environment] Action: CREATE_MANAGED_RUNTIME`);

    return {
      action: "CREATE_MANAGED_RUNTIME",
      executablePath: "",
      resolvedSource,
      reason,
    };
  },
};
