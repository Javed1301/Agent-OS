"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AppShell,
  GlassPanel,
  SectionHeader,
  PrimaryButton,
  SecondaryButton,
} from "@/components/primitives";
import { getAgent, getAgentHealth, runAgent, listExecutions, openFolder, importAgent, installAgentRuntime, rebuildAgentRuntime, getRuntimeDetails, createAgentRequirements, rescanAgentRuntime } from "@/lib/api";
import { HealthCheckItem, RuntimeMetadata } from "@/types";

const API_BASE =
  process.env.NEXT_PUBLIC_GATEWAY_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "";

interface PageProps {
  params: Promise<{ id: string }>;
}

// ─── Health check item display ───────────────────────────────────────────────

function HealthCheck({ item }: { item: HealthCheckItem }) {
  const iconMap = { pass: "✓", fail: "✗", warn: "!" };
  const colorMap = {
    pass: "text-[#2DD4BF] border-[#2DD4BF]/30 bg-[#2DD4BF]/8",
    fail: "text-red-300 border-red-600/40 bg-red-900/15",
    warn: "text-[#E2C48D] border-[#C7A66B]/40 bg-[#C7A66B]/8",
  };
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3 ${colorMap[item.status]}`}>
      <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
        item.status === "pass"
          ? "border-[#2DD4BF]/50 bg-[#2DD4BF]/10 text-[#2DD4BF]"
          : item.status === "fail"
          ? "border-red-500/50 bg-red-900/20 text-red-300"
          : "border-[#C7A66B]/50 bg-[#C7A66B]/10 text-[#E2C48D]"
      }`}>
        {iconMap[item.status]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-[#F5F5F7]">{item.label}</p>
        <p className="text-[11px] text-[#B3B7C2] mt-0.5 font-mono break-all">{item.detail}</p>
      </div>
    </div>
  );
}

// ─── Artifact viewer panel ───────────────────────────────────────────────────

function ArtifactViewer({ runId, artifacts }: { runId: string; artifacts: string[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [language, setLanguage] = useState("plaintext");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadArtifact = async (artifactPath: string) => {
    setSelected(artifactPath);
    setLoading(true);
    setError(null);
    setContent(null);
    try {
      const encodedPath = artifactPath.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`${API_BASE}/api/workflow-runs/${runId}/artifacts/${encodedPath}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setContent(data.content);
      setLanguage(data.language || "plaintext");
    } catch (err: any) {
      setError(err.message || "Failed to load artifact.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenFolder = async (artifactPath: string) => {
    const folderPath = artifactPath.includes("/")
      ? artifactPath.split("/").slice(0, -1).join("/")
      : ".";
    // We open the run directory itself
    try {
      await openFolder(`${API_BASE.replace("http://", "").replace(":8080", "")}` as any);
      // Actually call the shell API
      await fetch(`${API_BASE}/api/shell/open-folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: runId }),
      });
    } catch { /* non-critical */ }
  };

  if (artifacts.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {artifacts.map((art) => {
          const filename = art.split("/").pop() || art;
          const ext = filename.split(".").pop() || "";
          return (
            <button
              key={art}
              onClick={() => loadArtifact(art)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-mono transition cursor-pointer ${
                selected === art
                  ? "border-[#C7A66B]/60 bg-[#C7A66B]/10 text-[#E2C48D]"
                  : "border-[#2A2E36] bg-[#16181D] text-[#B3B7C2] hover:border-[#C7A66B]/30 hover:text-[#F5F5F7]"
              }`}
            >
              {filename}
              <span className="ml-1.5 text-[10px] text-[#6E7482] uppercase">.{ext}</span>
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="rounded-xl border border-[#2A2E36] bg-[#08090B] p-6 flex items-center justify-center gap-2.5">
          <span className="w-4 h-4 rounded-full border-2 border-[#C7A66B] border-t-transparent animate-spin" />
          <span className="text-xs text-[#B3B7C2]">Loading {selected?.split("/").pop()}...</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/10 p-4">
          <p className="text-xs font-semibold text-red-300 mb-1">Failed to load artifact</p>
          <p className="text-[11px] text-red-300/70 font-mono">{error}</p>
        </div>
      )}

      {content !== null && !loading && (
        <div className="rounded-xl border border-[#2A2E36] bg-black overflow-hidden flex flex-col h-[420px] min-h-0">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2A2E36] shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[#B3B7C2]">{selected?.split("/").pop()}</span>
              <span className="rounded border border-[#2A2E36] bg-[#16181D] px-1.5 py-0.5 text-[10px] text-[#6E7482] uppercase">{language}</span>
            </div>
            <span className="text-[10px] text-[#6E7482]">{content.split("\n").length} lines</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto p-4 bg-black">
            <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-[#E2C48D] font-mono">
              {content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function AgentDetailPage({ params }: PageProps) {
  const { id } = React.use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  // ── Test run state ──
  const [testInput, setTestInput] = useState("");
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [activeExecId, setActiveExecId] = useState<string | null>(null);

  // ── Live logs state ──
  const [logs, setLogs] = useState<string[]>([]);
  const [logStatus, setLogStatus] = useState<string>("");
  const [autoScroll, setAutoScroll] = useState(true);
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  // ── Artifact state ──
  const [latestRunId, setLatestRunId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<string[]>([]);

  // ── Data queries ──
  const { data: agent, isLoading: isLoadingAgent, error: agentError } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => getAgent(id),
  });

  const { data: health, isLoading: isLoadingHealth, refetch: refetchHealth } = useQuery({
    queryKey: ["agent-health", id],
    queryFn: () => getAgentHealth(id),
    refetchInterval: 20000,
  });

  const { data: allExecutions = [] } = useQuery({
    queryKey: ["executions"],
    queryFn: listExecutions,
    refetchInterval: activeExecId ? 2000 : false,
  });

  const [isBuildingRuntime, setIsBuildingRuntime] = useState(false);
  const [runtimeActionMsg, setRuntimeActionMsg] = useState<string | null>(null);

  const { data: runtimeMeta, refetch: refetchRuntime } = useQuery({
    queryKey: ["agent-runtime-meta", id, health?.runtimeHash],
    queryFn: async () => {
      const hash = health?.runtimeHash || agent?.runtime?.hash;
      if (!hash) return null;
      try {
        return await getRuntimeDetails(hash);
      } catch {
        return null;
      }
    },
    enabled: !!(health?.runtimeHash || agent?.runtime?.hash),
  });

  const handleInstallRuntime = async () => {
    setIsBuildingRuntime(true);
    setRuntimeActionMsg("Building isolated Python runtime with uv...");
    try {
      const res = await installAgentRuntime(id);
      setRuntimeActionMsg(res.message || "Runtime built successfully!");
      queryClient.invalidateQueries({ queryKey: ["agent", id] });
      queryClient.invalidateQueries({ queryKey: ["agent-health", id] });
      queryClient.invalidateQueries({ queryKey: ["runtimes"] });
      refetchHealth();
      refetchRuntime();
    } catch (err: any) {
      setRuntimeActionMsg(`Build failed: ${err.message}`);
    } finally {
      setIsBuildingRuntime(false);
    }
  };

  const handleRebuildRuntime = async () => {
    setIsBuildingRuntime(true);
    setRuntimeActionMsg("Rebuilding isolated Python runtime with uv...");
    try {
      const res = await rebuildAgentRuntime(id);
      setRuntimeActionMsg("Runtime rebuilt successfully!");
      queryClient.invalidateQueries({ queryKey: ["agent", id] });
      queryClient.invalidateQueries({ queryKey: ["agent-health", id] });
      queryClient.invalidateQueries({ queryKey: ["runtimes"] });
      refetchHealth();
      refetchRuntime();
    } catch (err: any) {
      setRuntimeActionMsg(`Rebuild failed: ${err.message}`);
    } finally {
      setIsBuildingRuntime(false);
    }
  };

  const handleCreateRequirements = async () => {
    setRuntimeActionMsg("Creating requirements.txt...");
    try {
      const res = await createAgentRequirements(id);
      setRuntimeActionMsg(res.message || "requirements.txt created!");
      queryClient.invalidateQueries({ queryKey: ["agent", id] });
      queryClient.invalidateQueries({ queryKey: ["agent-health", id] });
      refetchHealth();
    } catch (err: any) {
      setRuntimeActionMsg(`Failed: ${err.message}`);
    }
  };

  const handleRescanRuntime = async () => {
    setIsBuildingRuntime(true);
    setRuntimeActionMsg("Rescanning agent dependencies...");
    try {
      await rescanAgentRuntime(id);
      setRuntimeActionMsg("Dependencies rescanned successfully!");
      queryClient.invalidateQueries({ queryKey: ["agent", id] });
      queryClient.invalidateQueries({ queryKey: ["agent-health", id] });
      refetchHealth();
      refetchRuntime();
    } catch (err: any) {
      setRuntimeActionMsg(`Rescan failed: ${err.message}`);
    } finally {
      setIsBuildingRuntime(false);
    }
  };

  // ── Populate form defaults ──
  useEffect(() => {
    if (agent?.inputSchema?.properties) {
      const defaults: Record<string, any> = {};
      Object.entries(agent.inputSchema.properties).forEach(([key, prop]) => {
        if (prop.default !== undefined) defaults[key] = prop.default;
        else if (prop.type === "boolean") defaults[key] = false;
        else if (prop.type === "number") defaults[key] = 0;
        else defaults[key] = "";
      });
      setFormValues(defaults);
    }
  }, [agent]);

  // ── Find latest execution for this agent ──
  useEffect(() => {
    const mine = allExecutions.filter((e) => e.agentId === id);
    if (mine.length > 0) {
      const sorted = [...mine].sort(
        (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
      );
      const latest = sorted[0];
      setLatestRunId(latest.id);

      // Load artifacts for latest completed run
      if (latest.status === "completed" || latest.status === "failed") {
        const runDir = `${API_BASE}/api/workflow-runs/${latest.id}/artifacts`;
        fetch(runDir)
          .then((r) => r.json())
          .then((data) => setArtifacts(data.artifacts || []))
          .catch(() => setArtifacts([]));
      }
    }
  }, [allExecutions, id]);

  // ── Auto-scroll logic ──
  const handleScroll = useCallback(() => {
    const el = terminalRef.current;
    if (!el) return;
    const threshold = 40;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    userScrolledUp.current = !atBottom;
    setAutoScroll(atBottom);
  }, []);

  useEffect(() => {
    if (autoScroll && !userScrolledUp.current) {
      terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  // ── SSE stream for active execution ──
  useEffect(() => {
    if (!activeExecId) return;

    const sseUrl = `${API_BASE}/api/executions/${activeExecId}/stream`;
    const es = new EventSource(sseUrl);

    es.onmessage = (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        const { type, data } = payload;
        if (type === "status") {
          setLogStatus(data);
          if (data === "completed" || data === "failed" || data === "cancelled") {
            es.close();
            setActiveExecId(null);
            queryClient.invalidateQueries({ queryKey: ["executions"] });
          }
        } else if (type === "log") {
          const clean = typeof data === "string" && data.length > 25 ? data.substring(25) : data;
          setLogs((prev) => [...prev, clean]);
        }
      } catch { /* ignore */ }
    };

    es.onerror = () => {
      es.close();
      setActiveExecId(null);
    };

    return () => es.close();
  }, [activeExecId, queryClient]);

  // ── Handlers ──
  const handleInputChange = (key: string, value: any) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRunning(true);
    setRunError(null);
    setLogs([]);
    setLogStatus("queued");

    try {
      const payload: Record<string, any> = {};
      if (agent?.inputSchema?.properties) {
        Object.entries(agent.inputSchema.properties).forEach(([key, prop]) => {
          const val = formValues[key];
          if (prop.type === "number") payload[key] = Number(val);
          else if (prop.type === "boolean") payload[key] = Boolean(val);
          else payload[key] = val;
        });
      }
      // Also parse a freeform JSON input if provided
      if (testInput.trim()) {
        try {
          const parsed = JSON.parse(testInput);
          Object.assign(payload, parsed);
        } catch {
          payload["input"] = testInput.trim();
        }
      }

      const res = await runAgent(id, payload);
      setActiveExecId(res.executionId);
      setIsRunning(false);
      queryClient.invalidateQueries({ queryKey: ["executions"] });
    } catch (err: any) {
      setRunError(err.message || "Failed to start execution.");
      setIsRunning(false);
      setLogStatus("");
    }
  };

  const handleOpenWorkingDir = async () => {
    if (!agent?.workingDirectory) return;
    try {
      await fetch(`${API_BASE}/api/shell/open-folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: agent.workingDirectory }),
      });
    } catch { /* non-critical */ }
  };

  const handleOpenArtifactsDir = async () => {
    if (!latestRunId) return;
    // Get the run dir from the execution record
    try {
      const rec = await fetch(`${API_BASE}/api/executions/${latestRunId}`);
      const data = await rec.json();
      if (data.runDir) {
        await fetch(`${API_BASE}/api/shell/open-folder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: data.runDir }),
        });
      }
    } catch { /* non-critical */ }
  };

  const getStatusColor = (s?: string) => {
    if (s === "available") return "text-[#2DD4BF] border-[#2DD4BF]/40 bg-[#2DD4BF]/10";
    if (s === "warning") return "text-[#E2C48D] border-[#C7A66B]/60 bg-[#C7A66B]/15";
    if (s === "unavailable" || s === "misconfigured") return "text-red-300 border-red-600/50 bg-red-900/20";
    return "text-[#B3B7C2] border-[#2A2E36] bg-[#16181D]";
  };

  const getLogStatusColor = (s: string) => {
    if (s === "completed" || s === "started") return "text-[#2DD4BF] border-[#2DD4BF]/40 bg-[#2DD4BF]/10";
    if (s === "failed") return "text-red-300 border-red-600/50 bg-red-900/20";
    if (s === "queued" || s === "running") return "text-[#E2C48D] border-[#C7A66B]/60 bg-[#C7A66B]/10";
    return "text-[#B3B7C2] border-[#2A2E36] bg-[#16181D]";
  };

  // ── Loading / Error states ──
  if (isLoadingAgent) {
    return (
      <AppShell title="Agent Details">
        <div className="flex h-64 items-center justify-center text-sm text-[#B3B7C2]">
          Loading agent metadata...
        </div>
      </AppShell>
    );
  }

  if (agentError || !agent) {
    return (
      <AppShell title="Agent Details">
        <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
          <p className="text-red-300">Failed to load agent: {id}</p>
          <Link href="/agents">
            <SecondaryButton>Back to Registry</SecondaryButton>
          </Link>
        </div>
      </AppShell>
    );
  }

  const properties = agent.inputSchema?.properties || {};
  const hasInputs = Object.keys(properties).length > 0;

  return (
    <AppShell
      title={`Agent: ${agent.name}`}
      topActions={
        <div className="flex gap-2">
          <SecondaryButton onClick={handleOpenWorkingDir} title="Open working directory in Explorer">
            📁 Open Dir
          </SecondaryButton>
          <SecondaryButton onClick={() => refetchHealth()}>
            ↻ Recheck Health
          </SecondaryButton>
          <Link href="/agents">
            <SecondaryButton>← Registry</SecondaryButton>
          </Link>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)] animate-fade-in">

        {/* ── LEFT COLUMN ─────────────────────────────────────────────────── */}
        <div className="space-y-6 min-w-0">

          {/* A. Identity */}
          <GlassPanel className="p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5 flex-wrap mb-1">
                  <h2 className="text-2xl font-bold text-[#F5F5F7] tracking-tight">{agent.name}</h2>
                  <span
                    title={
                      (agent.source === "imported" || agent.isExternal || agent.logicalPath?.startsWith("external-agents/"))
                        ? "Imported Agent: Active manifest loaded from external-agents/ directory (overrides workspace stub)"
                        : "Workspace Agent: Active manifest loaded from agents/ directory"
                    }
                    className={`cursor-help rounded-md border px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                      (agent.source === "imported" || agent.isExternal || agent.logicalPath?.startsWith("external-agents/"))
                        ? "border-[#7A5AF8]/40 bg-[#7A5AF8]/10 text-[#a68ff8]"
                        : "border-[#2DD4BF]/40 bg-[#2DD4BF]/10 text-[#2DD4BF]"
                    }`}
                  >
                    {(agent.source === "imported" || agent.isExternal || agent.logicalPath?.startsWith("external-agents/")) ? "Imported" : "Workspace"}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-[#6E7482] mb-3">{agent.id}</p>
                <p className="text-sm text-[#B3B7C2] leading-relaxed">{agent.description}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${getStatusColor(health?.status)}`}>
                  {isLoadingHealth ? "Checking..." : health?.status || "unknown"}
                </span>
                <span className="text-[11px] text-[#6E7482]">v{agent.version || "1.0.0"}</span>
              </div>
            </div>

            {/* Capability badges */}
            {agent.capabilities.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {agent.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="rounded-full border border-[#C7A66B]/30 bg-[#C7A66B]/8 px-2.5 py-1 text-[11px] font-medium text-[#E2C48D]"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            )}
          </GlassPanel>

          {/* Non-portable warning banner */}
          {agent.isDockerCompatible === false && (
            <GlassPanel className="p-4 border-amber-500/40 bg-amber-950/20">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <span>⚠️</span> Non-Portable Host Path Detected
                  </p>
                  <p className="text-[11px] text-amber-200/80 mt-1 font-mono break-all">
                    {agent.workingDirectory}
                  </p>
                  <p className="text-[11px] text-amber-200/60 mt-0.5">
                    Host-absolute paths break inside Docker containers and on other team members' machines.
                  </p>
                </div>
                <PrimaryButton
                  onClick={async () => {
                    try {
                      await importAgent(agent.workingDirectory);
                      queryClient.invalidateQueries({ queryKey: ["agent", id] });
                      refetchHealth();
                    } catch (err: any) {
                      alert(err.message || "Failed to import agent");
                    }
                  }}
                  className="text-xs py-1.5 px-3 shrink-0"
                >
                  Import into Workspace
                </PrimaryButton>
              </div>
            </GlassPanel>
          )}

          {/* Runtime Panel */}
          {(() => {
            const filesChecked = health?.filesChecked || {
              "uv.lock": false,
              "pyproject.toml": false,
              "requirements.txt": false,
            };
            const hasDescriptor = filesChecked["uv.lock"] || filesChecked["pyproject.toml"] || filesChecked["requirements.txt"];
            const badgeStatus = health?.runtimeBadgeStatus || (runtimeMeta?.state === "available" ? "managed" : "fallback");

            const getBadgeInfo = () => {
              if (badgeStatus === "managed") {
                return { label: "● Managed", color: "border-[#2DD4BF]/40 bg-[#2DD4BF]/10 text-[#2DD4BF]" };
              }
              if (badgeStatus === "stale") {
                return { label: "⚠ Stale", color: "border-amber-500/50 bg-amber-950/30 text-amber-300" };
              }
              if (badgeStatus === "building") {
                return { label: "⟳ Building", color: "border-[#7A5AF8]/40 bg-[#7A5AF8]/10 text-[#a68ff8]" };
              }
              if (badgeStatus === "failed") {
                return { label: "✕ Failed", color: "border-red-500/40 bg-red-900/20 text-red-300" };
              }
              return { label: "○ Fallback", color: "border-gray-600/40 bg-gray-900/30 text-gray-400" };
            };

            const badge = getBadgeInfo();

            return (
              <GlassPanel className="p-5">
                <SectionHeader
                  eyebrow="Package Resolution & Caching"
                  title="Python Runtime Environment"
                  action={
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badge.color}`}>
                      {badge.label}
                    </span>
                  }
                />

                {health?.isStale && (
                  <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-950/20 p-3 text-xs text-amber-200">
                    ⚠ <strong>Dependency file changed!</strong> Runtime is stale. Rebuild recommended to apply updated packages.
                  </div>
                )}

                {runtimeActionMsg && (
                  <div className="mb-4 rounded-xl border border-[#7A5AF8]/40 bg-[#7A5AF8]/10 p-3 text-xs text-[#a68ff8]">
                    {runtimeActionMsg}
                  </div>
                )}

                {!hasDescriptor && (
                  <div className="mb-4 rounded-xl border border-gray-700/50 bg-[#16181D] p-3.5 space-y-2 text-xs">
                    <p className="text-[#F5F5F7] leading-relaxed">
                      No dependency descriptor found (requirements.txt, pyproject.toml, or uv.lock). Agent Workspace will use the system Python interpreter until a dependency descriptor is added.
                    </p>
                    <p className="text-[11px] text-[#B3B7C2]">
                      💡 For reproducible environments, add a <code className="text-[#E2C48D]">requirements.txt</code> or <code className="text-[#E2C48D]">pyproject.toml</code> file to the agent directory.
                    </p>
                  </div>
                )}

                {/* Searched Descriptor Files */}
                <div className="mb-4 rounded-xl border border-[#2A2E36] bg-[#0B0D11] p-3 space-y-1.5 text-xs font-mono">
                  <p className="text-[10px] uppercase tracking-wider text-[#B3B7C2] mb-1 font-sans font-semibold">Searched Descriptors</p>
                  {(["uv.lock", "pyproject.toml", "requirements.txt"] as const).map((filename) => {
                    const isFound = filesChecked[filename];
                    return (
                      <div key={filename} className="flex items-center justify-between">
                        <span className="text-[#B3B7C2]">{filename}</span>
                        <span className={isFound ? "text-[#2DD4BF] font-semibold" : "text-gray-500"}>
                          {isFound ? "✓ Found" : "— Not Found"}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-3 font-mono text-xs">
                  <div className="flex justify-between items-center rounded-xl border border-[#2A2E36] bg-[#16181D] p-3">
                    <span className="text-[#B3B7C2]">Dependency Source</span>
                    <span className="font-bold text-[#F5F5F7]">{agent.runtime?.dependencies?.file || runtimeMeta?.sourceType || (hasDescriptor ? "Detected" : "none")}</span>
                  </div>
                  <div className="flex justify-between items-center rounded-xl border border-[#2A2E36] bg-[#16181D] p-3">
                    <span className="text-[#B3B7C2]">Runtime Hash</span>
                    <span className="font-bold text-[#E2C48D]">{health?.runtimeHash || agent.runtime?.hash || "Not built"}</span>
                  </div>
                  {runtimeMeta && (
                    <>
                      <div className="flex justify-between items-center rounded-xl border border-[#2A2E36] bg-[#16181D] p-3">
                        <span className="text-[#B3B7C2]">Package Count</span>
                        <span className="text-[#F5F5F7]">{runtimeMeta.packageCount ?? "N/A"}</span>
                      </div>
                      <div className="flex justify-between items-center rounded-xl border border-[#2A2E36] bg-[#16181D] p-3">
                        <span className="text-[#B3B7C2]">Shared Agent Count</span>
                        <span className="text-[#F5F5F7]">{runtimeMeta.agentCount} agent(s)</span>
                      </div>
                      <div className="flex justify-between items-center rounded-xl border border-[#2A2E36] bg-[#16181D] p-3">
                        <span className="text-[#B3B7C2]">Last Used</span>
                        <span className="text-[#F5F5F7]">{runtimeMeta.lastUsedAt ? new Date(runtimeMeta.lastUsedAt).toLocaleString() : "Just now"}</span>
                      </div>
                      <div className="flex justify-between items-center rounded-xl border border-[#2A2E36] bg-[#16181D] p-3">
                        <span className="text-[#B3B7C2]">Install Duration</span>
                        <span className="text-[#F5F5F7]">{runtimeMeta.durationMs ? `${(runtimeMeta.durationMs / 1000).toFixed(1)}s` : "N/A"}</span>
                      </div>
                      <div className="flex justify-between items-center rounded-xl border border-[#2A2E36] bg-[#16181D] p-3">
                        <span className="text-[#B3B7C2]">Disk Size</span>
                        <span className="text-[#F5F5F7]">{(runtimeMeta.sizeBytes / (1024 * 1024)).toFixed(1)} MB</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between items-center rounded-xl border border-[#2A2E36] bg-[#16181D] p-3 min-w-0">
                    <span className="text-[#B3B7C2] flex-shrink-0 mr-2">Original Host Path</span>
                    <span className="text-[#F5F5F7] truncate">{agent.originalPath || agent.externalPath || "N/A (Workspace Agent)"}</span>
                  </div>
                  <div className="flex justify-between items-center rounded-xl border border-[#2A2E36] bg-[#16181D] p-3 min-w-0">
                    <span className="text-[#B3B7C2] flex-shrink-0 mr-2">Resolved Execution Path</span>
                    <span className="text-[#F5F5F7] truncate">{agent.interpreterPath || agent.resolvedPath || agent.workingDirectory}</span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {hasDescriptor ? (
                    runtimeMeta?.state === "available" ? (
                      <SecondaryButton
                        disabled={isBuildingRuntime}
                        onClick={handleRebuildRuntime}
                        className="flex-1 text-xs py-2 justify-center"
                      >
                        {isBuildingRuntime ? "Rebuilding..." : "↻ Rebuild Runtime"}
                      </SecondaryButton>
                    ) : (
                      <PrimaryButton
                        disabled={isBuildingRuntime}
                        onClick={handleInstallRuntime}
                        className="flex-1 text-xs py-2 justify-center"
                      >
                        {isBuildingRuntime ? "Building..." : "⚡ Install Runtime (uv)"}
                      </PrimaryButton>
                    )
                  ) : (
                    <PrimaryButton
                      onClick={handleCreateRequirements}
                      className="flex-1 text-xs py-2 justify-center"
                    >
                      + Create requirements.txt
                    </PrimaryButton>
                  )}
                  <SecondaryButton
                    disabled={isBuildingRuntime}
                    onClick={handleRescanRuntime}
                    className="text-xs py-2 px-3"
                  >
                    🔍 Rescan Dependencies
                  </SecondaryButton>
                  {runtimeMeta?.hash && (
                    <Link href="/settings/runtimes">
                      <SecondaryButton className="text-xs py-2 px-3">
                        View Lockfile
                      </SecondaryButton>
                    </Link>
                  )}
                </div>

                <div className="mt-3 text-right">
                  <Link href="/settings/runtimes" className="text-[11px] text-[#7A5AF8] hover:underline inline-flex items-center gap-1">
                    Learn about managed runtimes →
                  </Link>
                </div>
              </GlassPanel>
            );
          })()}

          {/* B. Execution Details */}
          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Runtime & Path Resolution" title="Execution Details" />
            <dl className="grid gap-2.5 sm:grid-cols-2">
              {[
                {
                  label: "Source Classification",
                  value: (agent.source === "imported" || agent.isExternal || agent.logicalPath?.startsWith("external-agents/")) ? "IMPORTED" : "WORKSPACE",
                  color: (agent.source === "imported" || agent.isExternal || agent.logicalPath?.startsWith("external-agents/")) ? "text-[#7A5AF8]" : "text-[#2DD4BF]"
                },
                { label: "Agent Type", value: agent.type },
                { label: "Logical Path", value: agent.logicalPath || agent.workingDirectory, mono: true },
                { label: "Original Host Path", value: agent.originalPath || agent.externalPath || "N/A (Workspace Agent)", mono: true },
                { label: "Resolved Container Path", value: agent.containerPath || agent.resolvedPath || agent.workingDirectory, mono: true },
                { label: "Docker Compatible", value: agent.isDockerCompatible !== false ? "Yes (Portable)" : "No (Host Absolute)", color: agent.isDockerCompatible !== false ? "text-[#2DD4BF]" : "text-amber-300" },
                { label: "Entrypoint", value: agent.entrypoint, mono: true },
                { label: "Interpreter", value: agent.interpreterPath || "system python", mono: true },
              ].map(({ label, value, mono, color }) => (
                <div key={label} className="rounded-xl border border-[#2A2E36] bg-[#16181D] p-3 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-[#B3B7C2] mb-1">{label}</p>
                  <p className={`text-xs break-all ${color || "text-[#F5F5F7]"} ${mono ? "font-mono" : "font-semibold"}`}>
                    {value}
                  </p>
                </div>
              ))}
            </dl>
          </GlassPanel>

          {/* C. Secrets Requirements */}
          <GlassPanel className="p-5">
            <SectionHeader
              eyebrow="Credentials"
              title="Declared Secrets & Vault Status"
              action={
                <Link href="/settings/secrets">
                  <SecondaryButton className="text-xs py-1 px-2.5">
                    ⚙ Manage Vault
                  </SecondaryButton>
                </Link>
              }
            />
            <div className="space-y-4">
              {/* Required Secrets */}
              <div>
                <p className="text-xs uppercase tracking-wider text-[#B3B7C2] font-semibold mb-2">
                  Required Secrets
                </p>
                {(!agent.secrets?.required || agent.secrets.required.length === 0) ? (
                  <p className="text-xs text-[#6E7482]">No required secrets declared in manifest.</p>
                ) : (
                  <div className="space-y-2">
                    {agent.secrets.required.map((key) => {
                      const isMissing = health?.missingRequiredSecrets?.includes(key) ?? health?.missingEnv?.includes(key);
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[#2A2E36] bg-[#16181D] p-3"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-[#F5F5F7]">{key}</span>
                            {!isMissing ? (
                              <span className="rounded-full border border-[#2DD4BF]/40 bg-[#2DD4BF]/10 px-2 py-0.5 text-[10px] font-bold text-[#2DD4BF]">
                                Connected
                              </span>
                            ) : (
                              <span className="rounded-full border border-red-500/40 bg-red-900/20 px-2 py-0.5 text-[10px] font-bold text-red-300">
                                Missing
                              </span>
                            )}
                          </div>
                          {isMissing && (
                            <Link href={`/settings/secrets?key=${encodeURIComponent(key)}`}>
                              <PrimaryButton className="text-xs py-1 px-2.5">
                                + Add Secret
                              </PrimaryButton>
                            </Link>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Optional Secrets */}
              {agent.secrets?.optional && agent.secrets.optional.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-[#B3B7C2] font-semibold mb-2">
                    Optional Secrets
                  </p>
                  <div className="space-y-2">
                    {agent.secrets.optional.map((key) => {
                      const isMissing = health?.missingOptionalSecrets?.includes(key);
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[#2A2E36] bg-[#16181D] p-3"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-[#F5F5F7]">{key}</span>
                            {!isMissing ? (
                              <span className="rounded-full border border-[#2DD4BF]/40 bg-[#2DD4BF]/10 px-2 py-0.5 text-[10px] font-bold text-[#2DD4BF]">
                                Connected
                              </span>
                            ) : (
                              <span className="rounded-full border border-[#C7A66B]/40 bg-[#C7A66B]/10 px-2 py-0.5 text-[10px] font-bold text-[#E2C48D]">
                                Optional Missing
                              </span>
                            )}
                          </div>
                          {isMissing && (
                            <Link href={`/settings/secrets?key=${encodeURIComponent(key)}`}>
                              <SecondaryButton className="text-xs py-1 px-2.5">
                                + Add Optional
                              </SecondaryButton>
                            </Link>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </GlassPanel>

          {/* D. Health Checks */}
          <GlassPanel className="p-5">
            <SectionHeader
              eyebrow="Diagnostics"
              title="Health Checks"
              action={
                <SecondaryButton className="text-xs py-1 px-2.5" onClick={() => refetchHealth()}>
                  Re-run
                </SecondaryButton>
              }
            />
            {isLoadingHealth ? (
              <div className="flex items-center gap-2.5 text-xs text-[#B3B7C2] py-4">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-[#C7A66B] border-t-transparent animate-spin" />
                Running health checks...
              </div>
            ) : health?.checks && health.checks.length > 0 ? (
              <div className="space-y-2">
                {health.checks.map((item, i) => (
                  <HealthCheck key={i} item={item} />
                ))}
                {health.detail && (
                  <div className="mt-3 rounded-xl border border-[#2A2E36] bg-[#08090B] p-3">
                    <p className="text-[11px] font-mono text-[#B3B7C2] break-all">{health.detail}</p>
                  </div>
                )}
              </div>
            ) : health ? (
              <div className={`rounded-xl border p-3.5 text-sm font-medium ${getStatusColor(health.status)}`}>
                {health.detail || health.status}
              </div>
            ) : (
              <p className="text-xs text-[#6E7482]">No health data available.</p>
            )}
          </GlassPanel>

          {/* E. Quick Test */}
          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Test Runner" title="Quick Test" />
            <form onSubmit={handleRun} className="space-y-4">
              {hasInputs && (
                <div className="space-y-3">
                  {Object.entries(properties).map(([key, prop]) => (
                    <div key={key} className="space-y-1.5">
                      <label htmlFor={`input-${key}`} className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#F5F5F7]">
                          {key}
                          {prop.required && <span className="text-red-400 ml-0.5">*</span>}
                        </span>
                        {prop.description && (
                          <span className="text-[#6E7482]">{prop.description}</span>
                        )}
                      </label>
                      {prop.type === "boolean" ? (
                        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#2A2E36] bg-[#0B0D11] p-3 text-xs">
                          <input
                            id={`input-${key}`}
                            type="checkbox"
                            checked={formValues[key] || false}
                            onChange={(e) => handleInputChange(key, e.target.checked)}
                            className="h-4 w-4 accent-[#C7A66B]"
                          />
                          <span className="text-[#B3B7C2]">Enable {key}</span>
                        </label>
                      ) : prop.type === "number" ? (
                        <input
                          id={`input-${key}`}
                          type="number"
                          required={prop.required}
                          value={formValues[key] ?? ""}
                          onChange={(e) => handleInputChange(key, e.target.value)}
                          className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-4 py-2 text-sm text-[#F5F5F7] focus:border-[#7A5AF8] focus:outline-none"
                        />
                      ) : (
                        <textarea
                          id={`input-${key}`}
                          required={prop.required}
                          rows={key === "goal" || key === "plan" || key === "prompt" ? 3 : 2}
                          value={formValues[key] || ""}
                          onChange={(e) => handleInputChange(key, e.target.value)}
                          placeholder={`Enter ${key}...`}
                          className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-4 py-2 text-sm text-[#F5F5F7] focus:border-[#7A5AF8] focus:outline-none resize-none"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!hasInputs && (
                <div>
                  <label htmlFor="freeform-input" className="block text-xs font-medium text-[#F5F5F7] mb-1.5">
                    Input (optional JSON or plain text)
                  </label>
                  <textarea
                    id="freeform-input"
                    rows={3}
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    placeholder='{"key": "value"}  or  leave blank for no input'
                    className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-4 py-2 text-sm font-mono text-[#F5F5F7] placeholder:text-[#3D4150] focus:border-[#7A5AF8] focus:outline-none resize-none"
                  />
                </div>
              )}

              {runError && (
                <div className="rounded-xl border border-red-500/40 bg-red-950/15 p-3 text-xs text-red-300">
                  {runError}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-1">
                {activeExecId && (
                  <Link href={`/executions/${activeExecId}`} className="text-xs text-[#E2C48D] hover:text-[#C7A66B] underline underline-offset-2">
                    View full console →
                  </Link>
                )}
                <PrimaryButton type="submit" disabled={isRunning || !!activeExecId} className="ml-auto">
                  {isRunning ? "Starting..." : activeExecId ? "Running..." : "▶ Run Test"}
                </PrimaryButton>
              </div>
            </form>
          </GlassPanel>

           {/* F. Live Output Terminal */}
          {(logs.length > 0 || activeExecId || logStatus) && (
            <GlassPanel className="p-5 flex flex-col h-[520px] min-h-0">
              <div className="border-b border-[#2A2E36] pb-3 mb-3 flex items-center justify-between shrink-0">
                <span className="text-xs uppercase tracking-[0.2em] text-[#B3B7C2]">Live Output</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-[#B3B7C2] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoScroll}
                      onChange={(e) => {
                        setAutoScroll(e.target.checked);
                        userScrolledUp.current = !e.target.checked;
                      }}
                      className="h-3.5 w-3.5 accent-[#C7A66B]"
                    />
                    Auto-scroll
                  </label>
                  {logStatus && (
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${getLogStatusColor(logStatus)}`}>
                      {logStatus}
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex-1 min-h-0 rounded-2xl bg-black border border-[#1C1F26] overflow-hidden">
                <div
                  ref={terminalRef}
                  onScroll={handleScroll}
                  className="h-full overflow-y-auto overflow-x-auto p-4 font-mono text-xs text-[#E2C48D] leading-6 space-y-0.5"
                >
                  {logs.length === 0 ? (
                    <div className="text-[#6E7482] italic">Waiting for output...</div>
                  ) : (
                    logs.map((line, idx) => (
                      <div key={idx} className="flex items-start hover:bg-[#16181D]/30 px-1 rounded">
                        <span className="text-[#6E7482] mr-2 select-none w-7 shrink-0 text-right">{idx + 1}</span>
                        <span className="whitespace-pre-wrap break-words flex-1 min-w-0">{line}</span>
                      </div>
                    ))
                  )}
                  <div ref={terminalEndRef} />
                </div>
              </div>
            </GlassPanel>
          )}

          {/* G. Produced Artifacts */}
          {latestRunId && artifacts.length > 0 && (
            <GlassPanel className="p-5">
              <SectionHeader
                eyebrow="Output Files"
                title="Produced Artifacts"
                action={
                  <div className="flex gap-2">
                    <SecondaryButton className="text-xs py-1 px-2.5" onClick={handleOpenArtifactsDir}>
                      📂 Open Folder
                    </SecondaryButton>
                    <Link href={`/executions/${latestRunId}`}>
                      <SecondaryButton className="text-xs py-1 px-2.5">Full Console</SecondaryButton>
                    </Link>
                  </div>
                }
              />
              <ArtifactViewer runId={latestRunId} artifacts={artifacts} />
            </GlassPanel>
          )}

        </div>

        {/* ── RIGHT SIDEBAR ────────────────────────────────────────────────── */}
        <aside className="space-y-4 min-w-0">

          {/* Status summary card */}
          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Status" title="Agent Health" />
            <div className="space-y-3">
              <div className={`rounded-xl border px-4 py-3 text-center ${getStatusColor(health?.status)}`}>
                <p className="text-sm font-bold capitalize">{health?.status || "unknown"}</p>
                {health?.checkedAt && (
                  <p className="text-[10px] mt-0.5 opacity-70">
                    Checked {new Date(health.checkedAt).toLocaleTimeString()}
                  </p>
                )}
              </div>

              {health?.missingEnv && health.missingEnv.length > 0 && (
                <div className="rounded-xl border border-red-500/30 bg-red-950/15 p-3">
                  <p className="text-[11px] font-semibold text-red-300 mb-1.5">Missing env vars:</p>
                  <div className="space-y-1">
                    {health.missingEnv.map((key) => (
                      <code key={key} className="block text-[11px] text-red-300/80">{key}</code>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </GlassPanel>

          {/* Recent executions */}
          <GlassPanel className="p-5">
            <SectionHeader eyebrow="History" title="Recent Runs" />
            {allExecutions.filter((e) => e.agentId === id).length === 0 ? (
              <p className="text-xs text-[#6E7482]">No executions yet. Run a test above.</p>
            ) : (
              <ul className="space-y-2">
                {allExecutions
                  .filter((e) => e.agentId === id)
                  .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
                  .slice(0, 5)
                  .map((exec) => (
                    <li key={exec.id}>
                      <Link href={`/executions/${exec.id}`} className="block rounded-lg border border-[#2A2E36] bg-[#16181D] px-3 py-2 hover:border-[#C7A66B]/30 transition">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-mono text-[#B3B7C2] truncate">{exec.id.slice(0, 20)}</span>
                          <span className={`text-[10px] rounded-full px-1.5 py-0.5 border ${
                            exec.status === "completed" ? "text-[#2DD4BF] border-[#2DD4BF]/30 bg-[#2DD4BF]/10" :
                            exec.status === "failed" ? "text-red-300 border-red-600/30 bg-red-900/10" :
                            exec.status === "running" ? "text-[#E2C48D] border-[#C7A66B]/30 bg-[#C7A66B]/10" :
                            "text-[#6E7482] border-[#2A2E36] bg-[#16181D]"
                          }`}>
                            {exec.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#6E7482] mt-0.5">
                          {new Date(exec.startTime).toLocaleString()}
                        </p>
                      </Link>
                    </li>
                  ))}
              </ul>
            )}
          </GlassPanel>

          {/* Agent config */}
          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Configuration" title="Agent Metadata" />
            <dl className="space-y-2.5 text-xs">
              {[
                { label: "ID", value: agent.id, mono: true },
                { label: "Version", value: agent.version || "1.0.0" },
                { label: "Type", value: agent.type },
                { label: "Category", value: agent.category },
                { label: "Phase", value: agent.phase ? `Phase ${agent.phase}` : "Unset" },
                { label: "WD Lock", value: agent.usesWdLock ? "Yes" : "No" },
                { label: "Source", value: agent.isExternal ? "External" : "Workspace" },
              ].map(({ label, value, mono }) => (
                <div key={label} className="flex items-start justify-between gap-2 rounded-lg border border-[#2A2E36] bg-[#16181D] px-3 py-2">
                  <dt className="text-[#B3B7C2] flex-shrink-0">{label}</dt>
                  <dd className={`text-[#F5F5F7] text-right min-w-0 ${mono ? "font-mono break-all text-[10px]" : "font-medium"}`}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </GlassPanel>

        </aside>
      </div>
    </AppShell>
  );
}
