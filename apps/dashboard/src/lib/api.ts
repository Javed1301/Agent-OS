import {
  AgentDefinition,
  AgentHealthResult,
  ExecutionIndexEntry,
  ExecutionRecord,
  WorkflowDefinition,
  WorkflowRunRecord
} from "../types";

const API_BASE =
  process.env.NEXT_PUBLIC_GATEWAY_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const errText = await res.text();
    let parsedErr;
    try {
      parsedErr = JSON.parse(errText);
    } catch {
      parsedErr = { error: errText || res.statusText };
    }
    throw new Error(parsedErr.error || `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function listAgents(): Promise<AgentDefinition[]> {
  const data = await fetchJson<{ agents: AgentDefinition[] }>("/api/agents");
  return data.agents || [];
}

export async function getAgent(id: string): Promise<AgentDefinition> {
  return fetchJson<AgentDefinition>(`/api/agents/${id}`);
}

export async function getAgentHealth(id: string): Promise<AgentHealthResult> {
  return fetchJson<AgentHealthResult>(`/api/agents/${id}/health`);
}

export async function runAgent(id: string, input: Record<string, unknown>): Promise<{ executionId: string; status: string }> {
  return fetchJson<{ executionId: string; status: string }>(`/api/agents/${id}/execute`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listExecutions(): Promise<ExecutionIndexEntry[]> {
  const data = await fetchJson<{ executions: ExecutionIndexEntry[] }>("/api/executions");
  return data.executions || [];
}

export async function getExecution(id: string): Promise<ExecutionRecord> {
  return fetchJson<ExecutionRecord>(`/api/executions/${id}`);
}

export async function cancelExecution(id: string): Promise<{ executionId: string; status: string }> {
  return fetchJson<{ executionId: string; status: string }>(`/api/executions/${id}/cancel`, {
    method: "POST",
  });
}

export async function listWorkflows(): Promise<WorkflowDefinition[]> {
  const data = await fetchJson<{ workflows: WorkflowDefinition[] }>("/api/workflows");
  return data.workflows || [];
}

export async function getWorkflow(id: string): Promise<WorkflowDefinition> {
  const list = await listWorkflows();
  const found = list.find((w) => w.id === id);
  if (!found) {
    throw new Error(`Workflow '${id}' not found.`);
  }
  return found;
}

export async function runWorkflow(id: string, input: Record<string, unknown>): Promise<{ runId: string; workflowId: string; status: string }> {
  return fetchJson<{ runId: string; workflowId: string; status: string }>(`/api/workflows/${id}/run`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createWorkflow(workflow: Omit<WorkflowDefinition, "version"> & { version?: string }): Promise<WorkflowDefinition> {
  return fetchJson<WorkflowDefinition>("/api/workflows", {
    method: "POST",
    body: JSON.stringify(workflow),
  });
}

export async function listWorkflowRuns(): Promise<WorkflowRunRecord[]> {
  const data = await fetchJson<{ runs: WorkflowRunRecord[] }>("/api/workflow-runs");
  return data.runs || [];
}

export async function getWorkflowRun(id: string): Promise<WorkflowRunRecord> {
  return fetchJson<WorkflowRunRecord>(`/api/workflow-runs/${id}`);
}

export async function cancelWorkflowRun(id: string): Promise<{ runId: string; status: string }> {
  return fetchJson<{ runId: string; status: string }>(`/api/workflow-runs/${id}/cancel`, {
    method: "POST",
  });
}

export async function listArtifacts(runId: string): Promise<string[]> {
  const data = await fetchJson<{ artifacts: string[] }>(`/api/workflow-runs/${runId}/artifacts`);
  return data.artifacts || [];
}

export interface ArtifactResult {
  path: string;
  content: string;
  language: string;
}

export async function getArtifact(runId: string, artifactPath: string): Promise<ArtifactResult> {
  // Ensure slashes are NOT percent-encoded — pass the path segments raw
  const encodedPath = artifactPath.split("/").map(encodeURIComponent).join("/");
  return fetchJson<ArtifactResult>(`/api/workflow-runs/${runId}/artifacts/${encodedPath}`);
}

// ---------------------------------------------------------------------------
// Agent import + external registry
// ---------------------------------------------------------------------------

export async function importAgent(folderPath: string): Promise<AgentDefinition> {
  const data = await fetchJson<{ agent: AgentDefinition }>("/api/registry/import", {
    method: "POST",
    body: JSON.stringify({ path: folderPath }),
  });
  return data.agent;
}

export async function listExternalAgents(): Promise<Array<{ id: string; path: string }>> {
  const data = await fetchJson<{ external: Array<{ id: string; path: string }> }>("/api/registry/external");
  return data.external || [];
}

// ---------------------------------------------------------------------------
// Shell actions
// ---------------------------------------------------------------------------

export async function openFolder(folderPath: string): Promise<{ success: boolean }> {
  return fetchJson<{ success: boolean }>("/api/shell/open-folder", {
    method: "POST",
    body: JSON.stringify({ path: folderPath }),
  });
}

// ---------------------------------------------------------------------------
// Execution artifacts (direct execution artifacts, not workflow run)
// ---------------------------------------------------------------------------

export async function listExecutionArtifacts(executionId: string): Promise<string[]> {
  try {
    const data = await fetchJson<{ artifacts: string[] }>(`/api/executions/${executionId}/artifacts`);
    return data.artifacts || [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Secrets Vault API
// ---------------------------------------------------------------------------

export interface SecretItem {
  name: string;
  present: boolean;
  lastUpdated: string;
}

export async function listSecrets(): Promise<SecretItem[]> {
  const data = await fetchJson<{ secrets: SecretItem[] }>("/api/secrets");
  return data.secrets || [];
}

export async function setSecret(name: string, value: string): Promise<{ success: boolean; name: string }> {
  return fetchJson<{ success: boolean; name: string }>("/api/secrets", {
    method: "POST",
    body: JSON.stringify({ name, value }),
  });
}

export async function deleteSecret(name: string): Promise<{ success: boolean; name: string }> {
  return fetchJson<{ success: boolean; name: string }>(`/api/secrets/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Runtime Manager API
// ---------------------------------------------------------------------------

import { RuntimeMetadata, RuntimeResolveResult, GCResult } from "../types";

export async function listRuntimes(): Promise<RuntimeMetadata[]> {
  const data = await fetchJson<{ runtimes: RuntimeMetadata[] }>("/api/runtimes");
  return data.runtimes || [];
}

export async function getRuntimeDetails(hash: string): Promise<RuntimeMetadata> {
  return fetchJson<RuntimeMetadata>(`/api/runtimes/${hash}`);
}

export async function getRuntimeLockfile(hash: string): Promise<string> {
  const data = await fetchJson<{ content: string }>(`/api/runtimes/${hash}/lockfile`);
  return data.content;
}

export async function installAgentRuntime(agentId: string): Promise<RuntimeResolveResult> {
  const data = await fetchJson<{ result: RuntimeResolveResult }>(`/api/agents/${agentId}/runtime/install`, {
    method: "POST",
  });
  return data.result;
}

export async function rebuildAgentRuntime(agentId: string): Promise<RuntimeResolveResult> {
  const data = await fetchJson<{ result: RuntimeResolveResult }>(`/api/agents/${agentId}/runtime/rebuild`, {
    method: "POST",
  });
  return data.result;
}

export async function deleteRuntime(hash: string): Promise<{ message: string }> {
  return fetchJson<{ message: string }>(`/api/runtimes/${hash}`, {
    method: "DELETE",
  });
}

export async function runRuntimeGC(): Promise<GCResult & { message: string }> {
  return fetchJson<GCResult & { message: string }>("/api/runtimes/gc", {
    method: "POST",
  });
}

export async function createAgentRequirements(agentId: string): Promise<{ message: string; path: string }> {
  return fetchJson<{ message: string; path: string }>(`/api/agents/${agentId}/create-requirements`, {
    method: "POST",
  });
}

export async function rescanAgentRuntime(agentId: string): Promise<{ message: string; agent: AgentDefinition; health: AgentHealthResult }> {
  return fetchJson<{ message: string; agent: AgentDefinition; health: AgentHealthResult }>(`/api/agents/${agentId}/runtime/rescan`, {
    method: "POST",
  });
}
