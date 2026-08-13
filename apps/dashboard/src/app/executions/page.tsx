"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  AppShell,
  GlassPanel,
  SectionHeader,
  SecondaryButton,
} from "@/components/primitives";
import { listExecutions, listWorkflowRuns, listAgents, listWorkflows } from "@/lib/api";

type HistoryItemType = "agent" | "workflow";

interface UnifiedHistoryItem {
  id: string;
  name: string;
  type: HistoryItemType;
  status: string;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  detail: string;
}

export default function ExecutionHistoryPage() {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "agent" | "workflow">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "failed" | "cancelled" | "running">("all");

  const { data: executions = [], isLoading: isLoadingExecs } = useQuery({
    queryKey: ["executions"],
    queryFn: listExecutions,
  });

  const { data: workflowRuns = [], isLoading: isLoadingWfRuns } = useQuery({
    queryKey: ["workflow-runs"],
    queryFn: listWorkflowRuns,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: listAgents,
  });

  const { data: workflows = [] } = useQuery({
    queryKey: ["workflows"],
    queryFn: listWorkflows,
  });

  const mergedHistory: UnifiedHistoryItem[] = React.useMemo(() => {
    const items: UnifiedHistoryItem[] = [];

    // Map Agent runs
    executions.forEach((exec) => {
      const agent = agents.find((a) => a.id === exec.agentId);
      items.push({
        id: exec.id,
        name: agent?.name || exec.agentId,
        type: "agent",
        status: exec.status,
        startTime: exec.startTime,
        endTime: exec.endTime,
        durationMs: exec.durationMs,
        detail: `Agent run with ${Object.keys(exec || {}).length} meta items.`,
      });
    });

    // Map Workflow runs
    workflowRuns.forEach((run) => {
      const wf = workflows.find((w) => w.id === run.workflowId);
      items.push({
        id: run.id,
        name: wf?.name || run.workflowId,
        type: "workflow",
        status: run.status,
        startTime: run.startTime,
        endTime: run.endTime,
        durationMs: run.durationMs,
        detail: `Workflow engine run. Completed steps: ${
          run.steps?.filter((s) => s.status === "completed").length || 0
        }/${run.steps?.length || 0}`,
      });
    });

    // Sort newest first
    return items.sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
  }, [executions, workflowRuns, agents, workflows]);

  // Apply search query and status/type filters
  const filteredHistory = React.useMemo(() => {
    const search = query.trim().toLowerCase();
    return mergedHistory.filter((item) => {
      const matchesType = typeFilter === "all" || item.type === typeFilter;
      const matchesStatus =
        statusFilter === "all" ||
        item.status === statusFilter ||
        (statusFilter === "running" && item.status === "queued");

      const matchesSearch =
        search.length === 0 ||
        item.id.toLowerCase().includes(search) ||
        item.name.toLowerCase().includes(search) ||
        item.detail.toLowerCase().includes(search) ||
        item.status.toLowerCase().includes(search);

      return matchesType && matchesStatus && matchesSearch;
    });
  }, [mergedHistory, query, typeFilter, statusFilter]);

  // Group chronologically (Today, Yesterday, Older)
  const groupedHistory = React.useMemo(() => {
    const groups: Record<string, UnifiedHistoryItem[]> = {
      Today: [],
      Yesterday: [],
      "Older Operations Log": [],
    };

    const todayStr = new Date().toDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    filteredHistory.forEach((item) => {
      const dateStr = new Date(item.startTime).toDateString();
      if (dateStr === todayStr) {
        groups.Today.push(item);
      } else if (dateStr === yesterdayStr) {
        groups.Yesterday.push(item);
      } else {
        groups["Older Operations Log"].push(item);
      }
    });

    return Object.entries(groups).filter(([_, items]) => items.length > 0);
  }, [filteredHistory]);

  const getStatusStyle = (statusVal: string) => {
    switch (statusVal) {
      case "completed":
        return "bg-[#2DD4BF]";
      case "running":
        return "bg-[#C7A66B]";
      case "failed":
      case "timeout":
        return "bg-red-500";
      case "cancelled":
        return "bg-[#B3B7C2]";
      default:
        return "bg-[#7A5AF8]"; // queued/info
    }
  };

  const getStatusTextStyles = (statusVal: string) => {
    switch (statusVal) {
      case "completed":
        return "text-[#2DD4BF] border-[#2DD4BF]/40 bg-[#2DD4BF]/10";
      case "running":
        return "text-[#E2C48D] border-[#C7A66B]/60 bg-[#C7A66B]/10";
      case "failed":
        return "text-red-300 border-red-600/50 bg-red-900/20";
      case "cancelled":
        return "text-[#B3B7C2] border-[#B3B7C2]/30 bg-[#16181D]";
      default:
        return "text-[#B3B7C2] border-[#2A2E36] bg-[#16181D]";
    }
  };

  const isLoading = isLoadingExecs || isLoadingWfRuns;

  return (
    <AppShell title="Operations History Log">
      {isLoading ? (
        <div className="flex h-64 items-center justify-center text-sm text-[#B3B7C2]">
          Loading operational log matrices...
        </div>
      ) : (
        <div className="space-y-6 animate-fade-in min-w-0">
          <GlassPanel className="p-5">
            <SectionHeader eyebrow="History" title="Operations Log Filters" />
            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <label className="block">
                <span className="sr-only">Search execution logs</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by ID, name, or metadata..."
                  className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-4 py-2 text-sm text-[#F5F5F7] placeholder:text-[#6E7482] focus:border-[#7A5AF8] focus:outline-none"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                {/* Type filters */}
                <div className="inline-flex rounded-xl border border-[#2A2E36] bg-[#16181D] p-1">
                  {(["all", "agent", "workflow"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className={`rounded-lg px-3 py-1 text-xs uppercase tracking-wider transition cursor-pointer capitalize ${
                        typeFilter === t
                          ? "bg-[#C7A66B]/20 text-[#E2C48D]"
                          : "text-[#B3B7C2] hover:text-[#F5F5F7]"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {/* Status filters */}
                <div className="inline-flex rounded-xl border border-[#2A2E36] bg-[#16181D] p-1">
                  {(["all", "completed", "failed", "cancelled", "running"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`rounded-lg px-3 py-1 text-xs uppercase tracking-wider transition cursor-pointer capitalize ${
                        statusFilter === s
                          ? "bg-[#C7A66B]/20 text-[#E2C48D]"
                          : "text-[#B3B7C2] hover:text-[#F5F5F7]"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </GlassPanel>

          {groupedHistory.length === 0 ? (
            <GlassPanel className="p-12 text-center text-[#B3B7C2] text-sm">
              No executions matched your query. Try adjusting filters or executing an agent first.
            </GlassPanel>
          ) : (
            <div className="space-y-6">
              {groupedHistory.map(([label, items]) => (
                <GlassPanel key={label} className="p-5">
                  <h3 className="mb-4 text-xs uppercase tracking-[0.2em] text-[#B3B7C2] font-semibold">
                    {label}
                  </h3>
                  <ul className="space-y-3">
                    {items.map((item) => {
                      const linkUrl =
                        item.type === "agent"
                          ? `/executions/${item.id}`
                          : `/workflow-runs/${item.id}`;

                      return (
                        <li key={item.id} className="transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5">
                          <Link href={linkUrl} className="block group flex items-start gap-4 rounded-xl border border-[#232731] bg-[#0F1115] p-4 transition hover:bg-[#16181D]">
                            <span
                              className={`mt-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0 ${getStatusStyle(
                                item.status
                              )}`}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-[#F5F5F7] group-hover:text-white transition">
                                  {item.name}
                                  <span className="ml-2 rounded border border-[#2A2E36] bg-[#08090B] px-1.5 py-0.5 text-[10px] font-normal text-[#B3B7C2] uppercase tracking-wide">
                                    {item.type}
                                  </span>
                                </p>
                                <time className="text-xs text-[#B3B7C2]">
                                  {new Date(item.startTime).toLocaleString()}
                                </time>
                              </div>
                              <p className="mt-1 text-xs text-[#B3B7C2] font-mono truncate">
                                ID: {item.id}
                              </p>
                              <p className="mt-2 text-xs text-[#B3B7C2]">
                                {item.detail}
                              </p>
                              {item.durationMs && (
                                <p className="mt-1 text-[11px] text-[#6E7482]">
                                  Duration: {(item.durationMs / 1000).toFixed(1)}s
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col justify-between items-end self-stretch">
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase font-medium tracking-wide ${getStatusTextStyles(item.status)}`}>
                                {item.status}
                              </span>
                              <span className="text-xs text-[#C7A66B] group-hover:underline mt-auto cursor-pointer">
                                Open Console →
                              </span>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </GlassPanel>
              ))}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
