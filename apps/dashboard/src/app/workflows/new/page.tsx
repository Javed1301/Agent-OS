"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AppShell,
  GlassPanel,
  SectionHeader,
  PrimaryButton,
  SecondaryButton,
} from "@/components/primitives";
import { listAgents, createWorkflow } from "@/lib/api";

interface StepState {
  id: string;
  agent: string;
  inputStr: string;
}

const slugify = (text: string) => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
};

const suggestStepId = (agentId: string) => {
  return agentId.replace(/-agent$/, "").replace(/-api$/, "");
};

function parseInputString(str: string): Record<string, any> {
  const trimmed = str.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new Error("Invalid JSON input. Ensure double quotes are used for keys and strings.");
    }
  }

  // Treat as simple key: value lines
  const result: Record<string, any> = {};
  const lines = trimmed.split("\n");
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      throw new Error(`Invalid line format: "${line}". Expected 'key: value'.`);
    }
    const key = line.substring(0, colonIndex).trim();
    const val = line.substring(colonIndex + 1).trim();
    result[key] = val;
  }
  return result;
}

function jsonToYaml(id: string, name: string, description: string, steps: any[]): string {
  let yaml = `id: ${id || ""}\n`;
  yaml += `name: ${name || ""}\n`;
  yaml += `version: 1.0.0\n`;
  yaml += `description: ${description || ""}\n\n`;
  yaml += `steps:\n`;
  steps.forEach((step) => {
    yaml += `  - id: ${step.id || ""}\n`;
    yaml += `    agent: ${step.agent || ""}\n`;
    if (step.input && Object.keys(step.input).length > 0) {
      yaml += `    input:\n`;
      Object.entries(step.input).forEach(([key, val]) => {
        if (typeof val === "string") {
          yaml += `      ${key}: ${val}\n`;
        } else {
          yaml += `      ${key}: ${JSON.stringify(val)}\n`;
        }
      });
    }
  });
  return yaml;
}

export default function NewWorkflowPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [isIdEditedManually, setIsIdEditedManually] = useState(false);
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<StepState[]>([
    { id: "", agent: "", inputStr: "" },
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { data: agents = [], isLoading: isLoadingAgents } = useQuery({
    queryKey: ["agents"],
    queryFn: listAgents,
  });

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (!isIdEditedManually) {
      setId(slugify(val));
    }
  };

  const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setId(slugify(e.target.value));
    setIsIdEditedManually(true);
  };

  const handleStepChange = (index: number, field: keyof StepState, value: string) => {
    const updated = [...steps];
    updated[index][field] = value;

    if (field === "agent" && !updated[index].id) {
      updated[index].id = suggestStepId(value);
    }
    setSteps(updated);
  };

  const handleAgentSelect = (index: number, agentId: string) => {
    const updated = [...steps];
    updated[index].agent = agentId;
    if (!updated[index].id) {
      updated[index].id = suggestStepId(agentId);
    }
    setSteps(updated);
  };

  const addStep = () => {
    setSteps([...steps, { id: "", agent: "", inputStr: "" }]);
  };

  const removeStep = (index: number) => {
    if (steps.length === 1) {
      setValidationError("A workflow must contain at least one step.");
      return;
    }
    setSteps(steps.filter((_, i) => i !== index));
    setValidationError(null);
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...steps];
    const temp = updated[index];
    updated[index] = updated[index - 1];
    updated[index - 1] = temp;
    setSteps(updated);
  };

  const moveDown = (index: number) => {
    if (index === steps.length - 1) return;
    const updated = [...steps];
    const temp = updated[index];
    updated[index] = updated[index + 1];
    updated[index + 1] = temp;
    setSteps(updated);
  };

  const yamlPreview = useMemo(() => {
    const parsedSteps = steps.map((s) => {
      let inputObj = {};
      try {
        inputObj = parseInputString(s.inputStr);
      } catch {
        // Silent catch for live preview
      }
      return { id: s.id, agent: s.agent, input: inputObj };
    });
    return jsonToYaml(id, name, description, parsedSteps);
  }, [id, name, description, steps]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setIsSaving(true);

    // 1. Basic validation
    if (!id) {
      setValidationError("Workflow ID is required.");
      setIsSaving(false);
      return;
    }
    if (!/^[a-z0-9-]+$/.test(id)) {
      setValidationError("Workflow ID must consist of lowercase alphanumeric characters and hyphens only.");
      setIsSaving(false);
      return;
    }
    if (steps.length === 0) {
      setValidationError("Workflow must contain at least one step.");
      setIsSaving(false);
      return;
    }

    // 2. Validate step IDs and inputs
    const stepIds = new Set<string>();
    const formattedSteps = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step.id.trim()) {
        setValidationError(`Step ${i + 1} is missing a Step ID.`);
        setIsSaving(false);
        return;
      }
      if (stepIds.has(step.id)) {
        setValidationError(`Duplicate Step ID '${step.id}' found. Each step must have a unique ID.`);
        setIsSaving(false);
        return;
      }
      stepIds.add(step.id);

      if (!step.agent) {
        setValidationError(`Step '${step.id}' must have an agent selected.`);
        setIsSaving(false);
        return;
      }

      let parsedInput = {};
      if (step.inputStr.trim()) {
        try {
          parsedInput = parseInputString(step.inputStr);
        } catch (err: any) {
          setValidationError(`Step '${step.id}' input error: ${err.message}`);
          setIsSaving(false);
          return;
        }
      }

      formattedSteps.push({
        id: step.id,
        agent: step.agent,
        input: parsedInput,
      });
    }

    try {
      await createWorkflow({
        id,
        name,
        description,
        steps: formattedSteps,
      });
      router.push("/workflows");
    } catch (err: any) {
      setValidationError(err.message || "Failed to create workflow.");
      setIsSaving(false);
    }
  };

  return (
    <AppShell
      title="Create Multi-Agent Workflow"
      topActions={
        <Link href="/workflows">
          <SecondaryButton>Cancel</SecondaryButton>
        </Link>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] animate-fade-in">
        
        {/* Left Side: Form Controls */}
        <div className="space-y-6 min-w-0">
          <GlassPanel className="p-6">
            <SectionHeader eyebrow="Setup" title="Workflow Metadata" />
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="wf-name" className="block text-sm font-semibold text-[#F5F5F7]">
                    Workflow Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="wf-name"
                    type="text"
                    required
                    value={name}
                    onChange={handleNameChange}
                    placeholder="e.g. Marketing Pipeline"
                    className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-4 py-2 text-sm text-[#F5F5F7] focus:border-[#7A5AF8] focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="wf-id" className="block text-sm font-semibold text-[#F5F5F7]">
                    Workflow ID <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="wf-id"
                    type="text"
                    required
                    value={id}
                    onChange={handleIdChange}
                    placeholder="e.g. marketing-pipeline"
                    className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-4 py-2 text-sm text-[#F5F5F7] focus:border-[#7A5AF8] focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="wf-desc" className="block text-sm font-semibold text-[#F5F5F7]">
                  Description
                </label>
                <textarea
                  id="wf-desc"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this workflow orchestrates..."
                  className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-4 py-2 text-sm text-[#F5F5F7] focus:border-[#7A5AF8] focus:outline-none"
                />
              </div>

              <div className="border-t border-[#2A2E36] pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <SectionHeader eyebrow="Sequence" title="Pipeline Steps" />
                  <SecondaryButton type="button" onClick={addStep}>
                    + Add Step
                  </SecondaryButton>
                </div>

                <div className="space-y-4">
                  {steps.map((step, idx) => (
                    <div
                      key={idx}
                      className="relative rounded-2xl border border-[#2A2E36] bg-[#16181D]/30 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="h-6 w-6 rounded-full bg-black border border-[#2A2E36] flex items-center justify-center font-mono font-semibold text-xs text-[#E2C48D]">
                          {idx + 1}
                        </span>
                        
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveUp(idx)}
                            className="p-1 text-xs text-[#B3B7C2] border border-[#2A2E36] bg-black hover:bg-[#16181D] rounded disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Move Step Up"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            disabled={idx === steps.length - 1}
                            onClick={() => moveDown(idx)}
                            className="p-1 text-xs text-[#B3B7C2] border border-[#2A2E36] bg-black hover:bg-[#16181D] rounded disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Move Step Down"
                          >
                            ▼
                          </button>
                          <button
                            type="button"
                            onClick={() => removeStep(idx)}
                            className="p-1 text-xs text-red-400 border border-red-950 bg-red-950/20 hover:bg-red-950/40 rounded ml-1"
                            title="Remove Step"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-[#B3B7C2]">
                            Step ID <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={step.id}
                            onChange={(e) => handleStepChange(idx, "id", e.target.value)}
                            placeholder="e.g. planner"
                            className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-3.5 py-1.5 text-xs text-[#F5F5F7] focus:border-[#7A5AF8] focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-[#B3B7C2]">
                            Select Agent <span className="text-red-400">*</span>
                          </label>
                          <select
                            required
                            value={step.agent}
                            onChange={(e) => handleAgentSelect(idx, e.target.value)}
                            className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-3.5 py-1.5 text-xs text-[#F5F5F7] focus:border-[#7A5AF8] focus:outline-none cursor-pointer"
                          >
                            <option value="" disabled>Select an agent...</option>
                            {agents.map((agent) => (
                              <option key={agent.id} value={agent.id}>
                                {agent.name} ({agent.id})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-[#B3B7C2]">
                          Optional Input Parameters (YAML key: value or JSON)
                        </label>
                        <textarea
                          rows={2}
                          value={step.inputStr}
                          onChange={(e) => handleStepChange(idx, "inputStr", e.target.value)}
                          placeholder={`plan: \${plan.output.plan}\ngoal: \${workflow.input.goal}`}
                          className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-3.5 py-1.5 text-xs text-[#E2C48D] font-mono focus:border-[#7A5AF8] focus:outline-none"
                        />
                      </div>

                    </div>
                  ))}
                </div>
              </div>

              {validationError && (
                <div className="rounded-xl border border-red-500/50 bg-red-950/20 p-3.5 text-xs text-red-300 font-medium">
                  {validationError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-[#2A2E36]">
                <Link href="/workflows">
                  <SecondaryButton type="button">Cancel</SecondaryButton>
                </Link>
                <PrimaryButton type="submit" disabled={isSaving}>
                  {isSaving ? "Creating Manifest..." : "Save Workflow"}
                </PrimaryButton>
              </div>

            </form>
          </GlassPanel>
        </div>

        {/* Right Side: Live YAML Preview */}
        <aside className="space-y-4 min-w-0">
          <GlassPanel className="p-5 flex flex-col h-[520px] overflow-hidden">
            <div className="border-b border-[#2A2E36] pb-3 mb-3 flex items-center justify-between shrink-0">
              <span className="text-xs uppercase tracking-[0.2em] text-[#B3B7C2]">
                Live Manifest Preview (YAML)
              </span>
              <span className="rounded bg-[#16181D] border border-[#2A2E36] px-2 py-0.5 text-[10px] text-[#E2C48D] font-mono">
                v1.0.0
              </span>
            </div>

            <div className="flex-1 min-h-0 rounded-2xl bg-black border border-[#1C1F26] p-4 overflow-y-auto overflow-x-auto">
              <pre className="text-xs text-[#E2C48D] font-mono leading-5 whitespace-pre">
                {yamlPreview}
              </pre>
            </div>
          </GlassPanel>
        </aside>

      </div>
    </AppShell>
  );
}
