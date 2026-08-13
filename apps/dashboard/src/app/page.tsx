"use client";

import React from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import Link from "next/link";
import {
  AppShell,
  GlassPanel,
  MetricCard,
  SectionHeader,
  PrimaryButton,
  SecondaryButton,
  TimelineItem,
} from "@/components/primitives";
import {
  listAgents,
  getAgentHealth,
  listExecutions,
  listWorkflows,
  listWorkflowRuns,
} from "@/lib/api";
import { ActivityItem, Metric } from "@/types";

export default function HomeDashboard() {
  // Query core dashboard lists
  const { data: agents = [], isLoading: isLoadingAgents } = useQuery({
    queryKey: ["agents"],
    queryFn: listAgents,
  });

  const { data: workflows = [], isLoading: isLoadingWorkflows } = useQuery({
    queryKey: ["workflows"],
    queryFn: listWorkflows,
  });

  const { data: executions = [], isLoading: isLoadingExecutions } = useQuery({
    queryKey: ["executions"],
    queryFn: listExecutions,
  });

  const { data: workflowRuns = [], isLoading: isLoadingWfRuns } = useQuery({
    queryKey: ["workflow-runs"],
    queryFn: listWorkflowRuns,
  });

  // Query health for all agents in parallel
  const healthQueries = useQueries({
    queries: agents.map((agent) => ({
      queryKey: ["agent-health", agent.id],
      queryFn: () => getAgentHealth(agent.id),
      staleTime: 10000,
    })),
  });

  // Calculations
  const totalAgents = agents.length;
  const healthyAgents = healthQueries.filter(
    (q) => q.data?.status === "available"
  ).length;

  const totalExecs = executions.length;
  const completedExecs = executions.filter((e) => e.status === "completed").length;
  const totalWfRuns = workflowRuns.length;
  const workflowCount = workflows.length;

  // Build live metrics matching design cards
  const metricsData: Metric[] = [
    {
      id: "m1",
      label: "Active Agents",
      value: `${healthyAgents} / ${totalAgents}`,
      delta: `${totalAgents > 0 ? Math.round((healthyAgents / totalAgents) * 100) : 0}% online`,
      trend: healthyAgents === totalAgents ? "neutral" : "up",
    },
    {
      id: "m2",
      label: "Tasks Run",
      value: String(totalExecs),
      delta: `+${executions.filter(e => {
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        return new Date(e.startTime).getTime() > oneDayAgo;
      }).length} past 24h`,
      trend: "up",
    },
    {
      id: "m3",
      label: "Workflow Catalog",
      value: String(workflowCount),
      delta: `${totalWfRuns} executions run`,
      trend: "neutral",
    },
    {
      id: "m4",
      label: "Success Rate",
      value: totalExecs > 0 ? `${Math.round((completedExecs / totalExecs) * 100)}%` : "0%",
      delta: `${completedExecs} total successful`,
      trend: "up",
    },
  ];

  // Merge agent executions and workflow runs to form the Recent Activity Feed
  const recentActivities: ActivityItem[] = React.useMemo(() => {
    const items: ActivityItem[] = [];

    // Map Agent Executions
    executions.forEach((exec) => {
      const agent = agents.find((a) => a.id === exec.agentId);
      const timeStr = new Date(exec.startTime).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      let statusType: "success" | "warning" | "error" | "info" = "info";
      if (exec.status === "completed") statusType = "success";
      else if (exec.status === "failed") statusType = "error";
      else if (exec.status === "running") statusType = "warning";

      items.push({
        id: exec.id,
        title: `${agent?.name || exec.agentId} Task Run`,
        detail: `Status: ${exec.status}. Duration: ${
          exec.durationMs ? (exec.durationMs / 1000).toFixed(1) + "s" : "N/A"
        }`,
        time: timeStr,
        status: statusType,
        rawTime: new Date(exec.startTime).getTime(),
      } as any);
    });

    // Map Workflow Runs
    workflowRuns.forEach((run) => {
      const wf = workflows.find((w) => w.id === run.workflowId);
      const timeStr = new Date(run.startTime).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      let statusType: "success" | "warning" | "error" | "info" = "info";
      if (run.status === "completed") statusType = "success";
      else if (run.status === "failed") statusType = "error";
      else if (run.status === "running") statusType = "warning";

      items.push({
        id: run.id,
        title: `Workflow: ${wf?.name || run.workflowId}`,
        detail: `Run Status: ${run.status}. Steps: ${run.steps?.length || 0}`,
        time: timeStr,
        status: statusType,
        rawTime: new Date(run.startTime).getTime(),
      } as any);
    });

    // Sort by time descending and slice
    return items
      .sort((a: any, b: any) => b.rawTime - a.rawTime)
      .slice(0, 5);
  }, [executions, workflowRuns, agents, workflows]);

  const isLoading =
    isLoadingAgents || isLoadingWorkflows || isLoadingExecutions || isLoadingWfRuns;

  return (
    <AppShell
      title="My Agent Workspace"
      topActions={
        <div className="flex gap-2">
          <Link href="/agents">
            <SecondaryButton aria-label="View all agents">Agents Registry</SecondaryButton>
          </Link>
          <Link href="/workflows">
            <PrimaryButton aria-label="View workflows catalog">Workflows Catalog</PrimaryButton>
          </Link>
        </div>
      }
    >
      {isLoading ? (
        <div className="flex h-64 items-center justify-center text-sm text-[#B3B7C2]">
          Loading dashboard metrics and active matrix nodes...
        </div>
      ) : (
        <div className="animate-fade-in space-y-6">
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <GlassPanel className="p-6 min-w-0">
              <SectionHeader eyebrow="Control Panel" title="My Agent Workspace" />
              <p className="max-w-xl text-sm text-[#B3B7C2] leading-relaxed">
                Coordinate autonomous workflows, monitor runtime behavior, and ship AI-driven actions with secure, isolated execution logs.
              </p>
              <div className="mt-8 flex items-center gap-4">
                <div
                  aria-hidden="true"
                  className="h-24 w-24 rounded-full bg-[radial-gradient(circle_at_30%_30%,#E2C48D,rgba(199,166,107,0.2)_50%,rgba(122,90,248,0.18)_100%)] blur-[0.3px]"
                />
                <Link href="/workflows">
                  <PrimaryButton>Run Multi-Agent Workflow</PrimaryButton>
                </Link>
              </div>
            </GlassPanel>
            <GlassPanel className="p-6 min-w-0">
              <SectionHeader eyebrow="Recent Activity" title="Operational Feed" />
              {recentActivities.length === 0 ? (
                <p className="text-xs text-[#B3B7C2]">No recent agent or workflow executions.</p>
              ) : (
                <ul className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                  {recentActivities.map((item) => (
                    <TimelineItem key={item.id} item={item} />
                  ))}
                </ul>
              )}
            </GlassPanel>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metricsData.map((metric) => (
              <MetricCard key={metric.id} metric={metric} />
            ))}
          </section>



          <section>
            <SectionHeader eyebrow="Agents" title="Active Agent Registry Overview" />
            <div className="grid gap-4 md:grid-cols-2">
              {agents.slice(0, 4).map((agent) => {
                const health = healthQueries.find((q) => q.data?.agentId === agent.id)?.data;
                const runtimeText = agent.type === "python" ? "Python Subprocess" : agent.type === "rest" ? "REST API Service" : agent.type;

                return (
                  <Link key={agent.id} href={`/agents/${agent.id}`}>
                    <GlassPanel className="p-5 transition duration-300 hover:-translate-y-0.5 hover:border-[#E2C48D]/40 cursor-pointer">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-base font-semibold text-[#F5F5F7]">{agent.name}</h3>
                          <p className="text-[10px] uppercase tracking-[0.18em] text-[#B3B7C2] mt-0.5">
                            {agent.category}
                          </p>
                        </div>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide ${
                            health?.status === "available"
                              ? "text-[#2DD4BF] border-[#2DD4BF]/40 bg-[#2DD4BF]/10"
                              : "text-red-300 border-red-600/50 bg-red-900/20"
                          }`}
                        >
                          {health?.status || "Checking..."}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-[#B3B7C2] line-clamp-2">{agent.description}</p>
                      <div className="mt-4 flex items-center justify-between text-xs text-[#B3B7C2]">
                        <span>Runtime: {runtimeText}</span>
                        <span>v{agent.version || "1.0.0"}</span>
                      </div>
                    </GlassPanel>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
