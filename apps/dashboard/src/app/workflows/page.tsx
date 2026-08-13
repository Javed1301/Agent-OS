"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  AppShell,
  GlassPanel,
  SectionHeader,
  PrimaryButton,
  SecondaryButton,
} from "@/components/primitives";
import { listWorkflows, listAgents } from "@/lib/api";

export default function WorkflowCatalogPage() {
  const { data: workflows = [], isLoading, error } = useQuery({
    queryKey: ["workflows"],
    queryFn: listWorkflows,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: listAgents,
  });

  const getAgentName = (agentId: string) => {
    const found = agents.find((a) => a.id === agentId);
    return found ? found.name : agentId;
  };

  return (
    <AppShell
      title="Workflow Catalog"
      topActions={
        <Link href="/workflows/new">
          <PrimaryButton>Create Workflow</PrimaryButton>
        </Link>
      }
    >
      {isLoading ? (
        <div className="flex h-64 items-center justify-center text-sm text-[#B3B7C2]">
          Loading workflow templates...
        </div>
      ) : error ? (
        <div className="flex h-64 items-center justify-center text-sm text-red-300">
          Failed to load workflow catalog.
        </div>
      ) : (
        <div className="animate-fade-in space-y-6">
          <GlassPanel className="p-6">
            <SectionHeader eyebrow="Catalog" title="Multi-Agent Orchestrator Templates" />
            <p className="max-w-2xl text-sm text-[#B3B7C2] leading-relaxed">
              Run sequency-based prompt chains and execution tasks using specialized agents. These graphs orchestrate inputs dynamically across multiple nodes.
            </p>
          </GlassPanel>

          {workflows.length === 0 ? (
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-[#2A2E36] text-sm text-[#B3B7C2]">
              No workflows available. Place them in your `workflows/` directory as `.yaml` definitions to load.
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {workflows.map((wf) => (
                <GlassPanel key={wf.id} className="p-5 flex flex-col justify-between h-full min-w-0">
                  <div>
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <h3 className="text-lg font-semibold text-[#F5F5F7]">
                        {wf.name}
                      </h3>
                      <span className="rounded border border-[#2A2E36] bg-[#16181D] px-2 py-0.5 text-xs text-[#B3B7C2]">
                        v{wf.version || "1.0.0"}
                      </span>
                    </div>
                    <p className="text-sm text-[#B3B7C2] mb-5 leading-relaxed">
                      {wf.description}
                    </p>

                    <div className="mb-6 space-y-2">
                      <h4 className="text-xs uppercase tracking-wider text-[#B3B7C2] font-semibold">
                        Participating Agents / Step Chain
                      </h4>
                      <ol className="space-y-2">
                        {wf.steps.map((step, idx) => (
                          <li
                            key={step.id}
                            className="flex items-center gap-3 rounded-lg border border-[#2A2E36] bg-[#16181D] px-3.5 py-2 text-xs font-mono text-[#E2C48D]"
                          >
                            <span className="h-5 w-5 rounded-full bg-[#08090B] border border-[#2A2E36] flex items-center justify-center font-sans font-semibold text-[10px] text-[#B3B7C2]">
                              {idx + 1}
                            </span>
                            <div className="flex-1">
                              <span className="font-semibold text-[#F5F5F7] mr-1">
                                {step.id}
                              </span>
                              <span className="text-[#6E7482]">
                                ({getAgentName(step.agent)})
                              </span>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>

                  <Link href={`/workflows/${wf.id}`}>
                    <PrimaryButton className="w-full text-center">
                      Configure & Run Workflow →
                    </PrimaryButton>
                  </Link>
                </GlassPanel>
              ))}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
