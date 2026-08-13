import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentDefinition } from "../types/agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.resolve(__dirname, "../../config/agents.json");

interface RegistryFile {
  agents: AgentDefinition[];
}

function readRegistry(): RegistryFile {
  const raw = fs.readFileSync(REGISTRY_PATH, "utf-8");
  return JSON.parse(raw) as RegistryFile;
}

function writeRegistry(data: RegistryFile): void {
  const tmp = REGISTRY_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, REGISTRY_PATH);
}

export const registryService = {
  /** Return all registered agents (status field is runtime — not stored) */
  listAgents(): AgentDefinition[] {
    return readRegistry().agents;
  },

  getAgent(id: string): AgentDefinition | undefined {
    return readRegistry().agents.find((a) => a.id === id);
  },

  addAgent(agent: AgentDefinition): AgentDefinition {
    const registry = readRegistry();
    if (registry.agents.some((a) => a.id === agent.id)) {
      throw new Error(`Agent with id '${agent.id}' already exists.`);
    }
    registry.agents.push(agent);
    writeRegistry(registry);
    return agent;
  },

  updateAgent(id: string, patch: Partial<AgentDefinition>): AgentDefinition {
    const registry = readRegistry();
    const idx = registry.agents.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error(`Agent '${id}' not found.`);
    registry.agents[idx] = { ...registry.agents[idx], ...patch, id };
    writeRegistry(registry);
    return registry.agents[idx];
  },

  removeAgent(id: string): void {
    const registry = readRegistry();
    const before = registry.agents.length;
    registry.agents = registry.agents.filter((a) => a.id !== id);
    if (registry.agents.length === before) {
      throw new Error(`Agent '${id}' not found.`);
    }
    writeRegistry(registry);
  },
};
