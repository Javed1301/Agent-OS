export interface WorkflowStep {
  id: string;
  agent: string; // Agent ID (e.g. planner-agent)
  input: Record<string, unknown>;
}

export interface WorkflowDefinition {
  id: string; // e.g. "generate-fastapi-app"
  name: string;
  version: string;
  description: string;
  steps: WorkflowStep[];
}

export interface StepRunRecord {
  stepId: string;
  executionId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  startTime?: string;
  endTime?: string;
  error?: string;
}

export interface WorkflowRunRecord {
  id: string;
  workflowId: string;
  input: Record<string, unknown>;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  startTime: string;
  endTime?: string;
  durationMs?: number;
  steps: StepRunRecord[];
  error?: string;
}
