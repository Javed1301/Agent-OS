import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registryService } from "../src/services/registry.service.js";
import { environmentResolver } from "../src/services/environment-resolver.service.js";
import { environmentDiscoveryService } from "../src/services/discovery.service.js";
import { environmentCompatibilityService } from "../src/services/compatibility.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const agentId = process.argv[2];
  if (!agentId) {
    console.error("Usage: npm run resolve -- <agent-id>");
    process.exit(1);
  }

  console.log(`Resolving agent: ${agentId}\n`);

  // Initialize registry
  await registryService.load();

  const agent = registryService.getAgent(agentId);
  if (!agent) {
    console.error(`Error: Agent '${agentId}' not found in registry.`);
    process.exit(1);
  }

  const startTime = Date.now();

  try {
    const result = await environmentResolver.resolve(
      agent.id,
      agent.logicalPath || agent.workingDirectory,
      agent.entrypoint
    );
    const elapsed = Date.now() - startTime;

    console.log(`=========================================`);
    console.log(`RESOLVER DIAGNOSTICS FOR: ${agentId}`);
    console.log(`=========================================`);
    console.log(`Agent ID:             ${agent.id}`);
    console.log(`Name:                 ${agent.name}`);
    console.log(`Type:                 ${agent.type}`);
    console.log(`Entrypoint:           ${result.resolvedSource.entrypoint}`);
    console.log(`Resolved SourceRoot:  ${result.resolvedSource.sourceRoot}`);
    console.log(`Dependency file:      ${result.resolvedSource.dependencyDescriptor}`);
    console.log(`Descriptor path:      ${result.resolvedSource.descriptorPath || "N/A"}`);
    console.log(`-----------------------------------------`);

    // Discovered environments
    const candidates = await environmentDiscoveryService.discover(result.resolvedSource.sourceRoot);
    console.log(`Discovered environments: ${candidates.length}`);
    candidates.forEach((c, idx) => {
      console.log(`  ${idx + 1}. [${c.type.toUpperCase()}] ${c.id}`);
      console.log(`     Interpreter: ${c.executablePath}`);
      console.log(`     Discovered:  ${c.discoveredFrom}`);
      console.log(`     Python:      ${c.pythonVersion}`);
    });

    console.log(`-----------------------------------------`);

    // Compatible environments
    let requirementsContent = "";
    if (result.resolvedSource.descriptorPath && fs.existsSync(result.resolvedSource.descriptorPath)) {
      requirementsContent = fs.readFileSync(result.resolvedSource.descriptorPath, "utf-8");
    }

    const compatible = [];
    for (const c of candidates) {
      const report = environmentCompatibilityService.evaluate(
        c,
        requirementsContent,
        result.resolvedSource.dependencyDescriptor,
        "3.11"
      );
      if (report.compatible) {
        compatible.push({ env: c, score: report.score });
      }
    }

    console.log(`Compatible environments: ${compatible.length}`);
    compatible.forEach((c, idx) => {
      console.log(`  ${idx + 1}. ${c.env.id} (Score: ${c.score})`);
      console.log(`     Interpreter: ${c.env.executablePath}`);
    });

    console.log(`-----------------------------------------`);
    console.log(`Selected environment:  ${result.environment ? result.environment.id : "N/A"}`);
    console.log(`Interpreter binary:    ${result.executablePath || "None (uv managed runtime fallback)"}`);
    console.log(`Decision / Action:     ${result.action}`);
    console.log(`Reason:                ${result.reason}`);
    console.log(`Resolution timing:     ${elapsed} ms`);
    console.log(`=========================================`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nResolution failed with error:\n${msg}`);
    process.exit(1);
  }
}

main();
