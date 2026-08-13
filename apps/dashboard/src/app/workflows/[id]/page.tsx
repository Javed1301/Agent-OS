"use client";

import React, { useState } from "react";
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
import { getWorkflow, runWorkflow } from "@/lib/api";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function WorkflowRunLauncherPage({ params }: PageProps) {
  const { id } = React.use(params);
  const router = useRouter();
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const { data: workflow, isLoading, error } = useQuery({
    queryKey: ["workflow", id],
    queryFn: () => getWorkflow(id),
  });

  // Extract workflow inputs dynamically
  const inputKeys = React.useMemo(() => {
    if (!workflow?.steps) return [];
    const keys = new Set<string>();
    const regex = /\$\{workflow\.input\.(.*?)\}/g;

    const traverse = (obj: any) => {
      if (typeof obj === "string") {
        let match;
        // Reset regex index for safety
        regex.lastIndex = 0;
        while ((match = regex.exec(obj)) !== null) {
          keys.add(match[1]);
        }
      } else if (typeof obj === "object" && obj !== null) {
        Object.values(obj).forEach(traverse);
      }
    };

    workflow.steps.forEach((step) => {
      traverse(step.input);
    });

    return Array.from(keys);
  }, [workflow]);

  const handleInputChange = (key: string, value: string) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRunning(true);
    setRunError(null);
    try {
      const res = await runWorkflow(id, inputs);
      router.push(`/workflow-runs/${res.runId}`);
    } catch (err: any) {
      setRunError(err.message || "Failed to start workflow run.");
      setIsRunning(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell title="Start Workflow">
        <div className="flex h-64 items-center justify-center text-sm text-[#B3B7C2]">
          Loading workflow definition...
        </div>
      </AppShell>
    );
  }

  if (error || !workflow) {
    return (
      <AppShell title="Start Workflow">
        <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
          <p className="text-red-300">Failed to load workflow template: {id}</p>
          <Link href="/workflows">
            <SecondaryButton>Back to Catalog</SecondaryButton>
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={`Run Workflow: ${workflow.name}`}
      topActions={
        <Link href="/workflows">
          <SecondaryButton>Back to Catalog</SecondaryButton>
        </Link>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] animate-fade-in">
        <div className="space-y-6 min-w-0">
          <GlassPanel className="p-6">
            <SectionHeader eyebrow="Configuration" title="Workflow Input Variables" />
            <p className="text-sm text-[#B3B7C2] mb-6 leading-relaxed">
              Fill in the parameters requested by this multi-agent workflow. The orchestrator will coordinate input/output states dynamically across each step.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {inputKeys.length === 0 ? (
                <div className="text-xs italic text-[#B3B7C2] p-4 rounded-xl border border-[#2A2E36] bg-[#16181D]">
                  This workflow accepts no external input variables. Ready to run directly.
                </div>
              ) : (
                inputKeys.map((key) => (
                  <div key={key} className="space-y-1.5">
                    <label htmlFor={`input-${key}`} className="block text-sm font-semibold text-[#F5F5F7]">
                      {key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                      <span className="text-red-400 ml-0.5">*</span>
                    </label>
                    <textarea
                      id={`input-${key}`}
                      required
                      rows={key === "goal" ? 4 : 2}
                      value={inputs[key] || ""}
                      onChange={(e) => handleInputChange(key, e.target.value)}
                      placeholder={`Provide a value for ${key}...`}
                      className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-4 py-2 text-sm text-[#F5F5F7] focus:border-[#7A5AF8] focus:outline-none"
                    />
                  </div>
                ))
              )}

              {runError && (
                <div className="rounded-xl border border-red-500/50 bg-red-950/20 p-3.5 text-xs text-red-300">
                  {runError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Link href="/workflows">
                  <SecondaryButton type="button">Cancel</SecondaryButton>
                </Link>
                <PrimaryButton type="submit" disabled={isRunning}>
                  {isRunning ? "Initializing Engine..." : "Start Orchestrated Workflow"}
                </PrimaryButton>
              </div>
            </form>
          </GlassPanel>
        </div>

        <aside className="space-y-4 min-w-0">
          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Graph Nodes" title="Pipeline Steps" />
            <ol className="space-y-3.5 text-sm">
              {workflow.steps.map((step, idx) => (
                <li
                  key={step.id}
                  className="rounded-xl border border-[#2A2E36] bg-[#16181D] p-3 flex items-start gap-3"
                >
                  <span className="h-5 w-5 rounded-full bg-[#08090B] border border-[#2A2E36] flex items-center justify-center font-semibold text-[10px] text-[#E2C48D]">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-[#F5F5F7] text-xs font-mono">{step.id}</p>
                    <p className="text-[11px] text-[#B3B7C2]">Agent: {step.agent}</p>
                  </div>
                </li>
              ))}
            </ol>
          </GlassPanel>
        </aside>
      </div>
    </AppShell>
  );
}
