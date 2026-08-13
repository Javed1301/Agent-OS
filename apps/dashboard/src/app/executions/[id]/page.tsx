"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AppShell,
  GlassPanel,
  SectionHeader,
  PrimaryButton,
  SecondaryButton,
} from "@/components/primitives";
import { getExecution, cancelExecution, getAgent } from "@/lib/api";

const API_BASE =
  process.env.NEXT_PUBLIC_GATEWAY_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "http://localhost:4000";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ExecutionConsolePage({ params }: PageProps) {
  const { id } = React.use(params);
  const router = useRouter();
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("queued");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  // Track artifacts and runDir
  const [runDir, setRunDir] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<string[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(null);
  const [artifactContent, setArtifactContent] = useState<string | null>(null);
  const [artifactLanguage, setArtifactLanguage] = useState("plaintext");
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [artifactError, setArtifactError] = useState<string | null>(null);

  // Fetch initial detail
  const { data: execution, refetch: refetchExec } = useQuery({
    queryKey: ["execution", id],
    queryFn: () => getExecution(id),
  });

  const agentId = execution?.agentId || "";
  const { data: agent } = useQuery({
    queryKey: ["agent", agentId],
    queryFn: () => getAgent(agentId),
    enabled: !!agentId,
  });

  // Capture runDir from execution record
  useEffect(() => {
    if (execution?.runDir) {
      setRunDir(execution.runDir);
    }
  }, [execution]);

  // Load past logs if execution is already finished
  useEffect(() => {
    if (execution) {
      setStatus(execution.status);
      if (execution.error) setError(execution.error);
      if (execution.result) setResult(execution.result);

      if (execution.status !== "queued" && execution.status !== "running") {
        fetch(`${API_BASE}/api/executions/${id}/logs`)
          .then((res) => res.json())
          .then((data) => {
            if (data.logs) {
              const lines = data.logs
                .split("\n")
                .filter((l: string) => l.trim().length > 0)
                .map((l: string) => l.length > 25 ? l.substring(25) : l);
              setLogs(lines);
            }
          })
          .catch((err) => console.error("Failed to load logs:", err));

        // Load artifact list from execution run dir
        if (execution.runDir) {
          // Derive runId from path
          const parts = execution.runDir.replace(/\\/g, "/").split("/");
          const execDirName = parts[parts.length - 1];
          fetch(`${API_BASE}/api/workflow-runs/${execDirName}/artifacts`)
            .then((r) => r.json())
            .then((data) => setArtifacts(data.artifacts || []))
            .catch(() => setArtifacts([]));
        }
      }
    }
  }, [execution, id]);

  // Connect to SSE stream if the task is still active
  useEffect(() => {
    if (!execution || execution.status === "completed" || execution.status === "failed" || execution.status === "cancelled") {
      return;
    }

    const sseUrl = `${API_BASE}/api/executions/${id}/stream`;
    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { type, data } = payload;

        if (type === "status") {
          setStatus(data);
          refetchExec();
        } else if (type === "log") {
          const cleanLine = typeof data === "string" && data.length > 25 ? data.substring(25) : data;
          setLogs((prev) => [...prev, cleanLine]);
        } else if (type === "result") {
          setResult(data);
          refetchExec();
        } else if (type === "error") {
          setError(data);
          refetchExec();
        } else if (type === "completed") {
          setStatus("completed");
          eventSource.close();
          refetchExec();
        }
      } catch (err) {
        console.error("Error parsing SSE data:", err);
      }
    };

    eventSource.onerror = () => {
      refetchExec().then((res) => {
        if (res.data && res.data.status !== "running" && res.data.status !== "queued") {
          eventSource.close();
        }
      });
    };

    return () => {
      eventSource.close();
    };
  }, [execution, id, refetchExec]);

  // Auto-scroll detection
  const handleScroll = useCallback(() => {
    const el = terminalRef.current;
    if (!el) return;
    const threshold = 40;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    userScrolledUp.current = !atBottom;
    if (atBottom) setAutoScroll(true);
  }, []);

  // Scroll to bottom on new logs (only when auto-scroll is on and user hasn't scrolled up)
  useEffect(() => {
    if (autoScroll && !userScrolledUp.current) {
      terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      await cancelExecution(id);
      setStatus("cancelled");
      refetchExec();
    } catch (err: any) {
      console.error("Failed to cancel execution:", err);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleOpenFolder = async () => {
    if (!runDir) return;
    try {
      await fetch(`${API_BASE}/api/shell/open-folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: runDir }),
      });
    } catch { /* non-critical */ }
  };

  const loadArtifact = async (artifactPath: string) => {
    setSelectedArtifact(artifactPath);
    setArtifactLoading(true);
    setArtifactError(null);
    setArtifactContent(null);
    try {
      // Get the execution run dir name to use as runId
      const parts = (execution?.runDir || "").replace(/\\/g, "/").split("/");
      const execDirName = parts[parts.length - 1] || id;
      const encodedPath = artifactPath.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`${API_BASE}/api/workflow-runs/${execDirName}/artifacts/${encodedPath}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setArtifactContent(data.content);
      setArtifactLanguage(data.language || "plaintext");
    } catch (err: any) {
      setArtifactError(err.message || "Failed to load artifact.");
    } finally {
      setArtifactLoading(false);
    }
  };

  const getStatusColor = (statusVal: string) => {
    switch (statusVal) {
      case "completed":
        return "text-[#2DD4BF] border-[#2DD4BF]/40 bg-[#2DD4BF]/10";
      case "running":
      case "started":
        return "text-[#E2C48D] border-[#C7A66B]/60 bg-[#C7A66B]/10";
      case "failed":
      case "timeout":
        return "text-red-300 border-red-600/50 bg-red-900/20";
      case "cancelled":
        return "text-[#B3B7C2] border-[#B3B7C2]/30 bg-[#16181D]";
      default:
        return "text-[#B3B7C2] border-[#2A2E36] bg-[#16181D]";
    }
  };

  const isActive = status === "running" || status === "queued";

  return (
    <AppShell
      title={`Console: ${id.substring(0, 16)}`}
      topActions={
        <div className="flex gap-2">
          {isActive && (
            <SecondaryButton onClick={handleCancel} disabled={isCancelling}>
              {isCancelling ? "Stopping..." : "Cancel Task"}
            </SecondaryButton>
          )}
          {runDir && (
            <SecondaryButton onClick={handleOpenFolder}>
              📁 Open Folder
            </SecondaryButton>
          )}
          <Link href="/executions">
            <SecondaryButton>Execution History</SecondaryButton>
          </Link>
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] animate-fade-in">
        <div className="space-y-6 min-w-0">

          {/* ── Terminal Panel ────────────────────────────────────────────── */}
          <GlassPanel className="p-5 flex flex-col h-[520px] min-h-0">
            <div className="border-b border-[#2A2E36] pb-3 mb-3 flex items-center justify-between shrink-0">
              <span className="text-xs uppercase tracking-[0.2em] text-[#B3B7C2]">
                Live Runtime Terminal
              </span>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs text-[#B3B7C2] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => {
                      setAutoScroll(e.target.checked);
                      userScrolledUp.current = !e.target.checked;
                    }}
                    className="h-3.5 w-3.5 accent-[#C7A66B] rounded border-[#2A2E36]"
                  />
                  <span>Auto-scroll</span>
                </label>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide capitalize ${getStatusColor(status)}`}>
                  {status}
                </span>
              </div>
            </div>

            <div className="flex-1 min-h-0 rounded-2xl bg-black border border-[#1C1F26] overflow-hidden">
              <div
                ref={terminalRef}
                onScroll={handleScroll}
                className="h-full overflow-y-auto overflow-x-auto p-4 font-mono text-xs text-[#E2C48D] leading-6 space-y-0.5"
              >
                {logs.length === 0 ? (
                  <div className="text-[#6E7482] italic">
                    {isActive ? "Waiting for terminal stream output..." : "No log output recorded."}
                  </div>
                ) : (
                  logs.map((line, idx) => (
                    <div key={idx} className="flex items-start hover:bg-[#16181D]/30 px-1 rounded">
                      <span className="text-[#6E7482] mr-2 select-none w-8 shrink-0 text-right font-mono">
                        {idx + 1}
                      </span>
                      <span className="whitespace-pre-wrap break-words flex-1 min-w-0 font-mono">
                        {line}
                      </span>
                    </div>
                  ))
                )}
                <div ref={terminalEndRef} />
              </div>
            </div>
          </GlassPanel>


          {/* ── Artifacts Panel ───────────────────────────────────────────── */}
          {artifacts.length > 0 && (
            <GlassPanel className="p-5">
              <SectionHeader
                eyebrow="Output Files"
                title="Produced Artifacts"
                action={
                  runDir ? (
                    <SecondaryButton className="text-xs py-1 px-2.5" onClick={handleOpenFolder}>
                      📂 Open Folder
                    </SecondaryButton>
                  ) : undefined
                }
              />
              <div className="flex flex-wrap gap-2 mb-4">
                {artifacts.map((art) => {
                  const filename = art.split("/").pop() || art;
                  return (
                    <button
                      key={art}
                      onClick={() => loadArtifact(art)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-mono transition cursor-pointer ${
                        selectedArtifact === art
                          ? "border-[#C7A66B]/60 bg-[#C7A66B]/10 text-[#E2C48D]"
                          : "border-[#2A2E36] bg-[#16181D] text-[#B3B7C2] hover:border-[#C7A66B]/30 hover:text-[#F5F5F7]"
                      }`}
                    >
                      {filename}
                    </button>
                  );
                })}
              </div>

              {artifactLoading && (
                <div className="flex items-center gap-2.5 py-4">
                  <span className="w-4 h-4 rounded-full border-2 border-[#C7A66B] border-t-transparent animate-spin" />
                  <span className="text-xs text-[#B3B7C2]">Loading {selectedArtifact?.split("/").pop()}...</span>
                </div>
              )}

              {artifactError && (
                <div className="rounded-xl border border-red-500/30 bg-red-950/10 p-4">
                  <p className="text-xs font-semibold text-red-300 mb-1">Failed to load file</p>
                  <p className="text-[11px] text-red-300/70 font-mono">{artifactError}</p>
                </div>
              )}

               {artifactContent !== null && !artifactLoading && (
                <div className="rounded-xl border border-[#2A2E36] bg-black overflow-hidden flex flex-col h-[420px] min-h-0">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2A2E36] shrink-0">
                    <span className="text-xs font-mono text-[#B3B7C2]">{selectedArtifact?.split("/").pop()}</span>
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-[#2A2E36] bg-[#16181D] px-1.5 py-0.5 text-[10px] text-[#6E7482] uppercase">{artifactLanguage}</span>
                      <span className="text-[10px] text-[#6E7482]">{artifactContent.split("\n").length} lines</span>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto p-4 bg-black">
                    <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-[#E2C48D] font-mono">
                      {artifactContent}
                    </pre>
                  </div>
                </div>
              )}
            </GlassPanel>
          )}

          {/* ── Result ──────────────────────────────────────────────────── */}
          {result && (
            <GlassPanel className="p-6">
              <SectionHeader eyebrow="Metadata" title="Execution Output" />
              <div className="w-full overflow-x-auto rounded-xl border border-[#2A2E36] bg-black/40">
                <pre className="min-w-0 whitespace-pre-wrap break-words p-4 text-sm font-mono text-[#F5F5F7]">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </GlassPanel>
          )}

          {/* ── Error ───────────────────────────────────────────────────── */}
          {error && (
            <GlassPanel className="p-6 border-red-500/20 bg-red-950/10">
              <SectionHeader eyebrow="Diagnostic Alert" title="Execution Error" />
              <div className="mt-2 rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-xs font-mono text-red-300 whitespace-pre-wrap break-words">
                {error}
              </div>
            </GlassPanel>
          )}
        </div>

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside className="space-y-4 min-w-0">
          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Execution Metadata" title="Details" />
            <dl className="space-y-3.5 text-sm">
              <div className="flex flex-col gap-1 rounded-xl border border-[#2A2E36] bg-[#16181D] p-3">
                <dt className="text-xs text-[#B3B7C2] uppercase tracking-wide">Execution ID</dt>
                <dd className="font-mono text-xs text-[#F5F5F7] select-all break-all">{id}</dd>
              </div>
              <div className="flex flex-col gap-1 rounded-xl border border-[#2A2E36] bg-[#16181D] p-3">
                <dt className="text-xs text-[#B3B7C2] uppercase tracking-wide">Target Agent</dt>
                <dd className="font-semibold text-[#F5F5F7]">
                  {agent ? (
                    <Link href={`/agents/${agent.id}`} className="hover:text-[#E2C48D] transition">
                      {agent.name}
                    </Link>
                  ) : (
                    execution?.agentId || "Loading..."
                  )}
                </dd>
              </div>
              <div className="flex flex-col gap-1 rounded-xl border border-[#2A2E36] bg-[#16181D] p-3">
                <dt className="text-xs text-[#B3B7C2] uppercase tracking-wide">Start Time</dt>
                <dd className="font-semibold text-[#F5F5F7]">
                  {execution ? new Date(execution.startTime).toLocaleString() : "N/A"}
                </dd>
              </div>
              {execution?.endTime && (
                <div className="flex flex-col gap-1 rounded-xl border border-[#2A2E36] bg-[#16181D] p-3">
                  <dt className="text-xs text-[#B3B7C2] uppercase tracking-wide">Completed At</dt>
                  <dd className="font-semibold text-[#F5F5F7]">
                    {new Date(execution.endTime).toLocaleString()}
                  </dd>
                </div>
              )}
              {execution?.durationMs && (
                <div className="flex flex-col gap-1 rounded-xl border border-[#2A2E36] bg-[#16181D] p-3">
                  <dt className="text-xs text-[#B3B7C2] uppercase tracking-wide">Duration</dt>
                  <dd className="font-semibold text-[#F5F5F7]">
                    {(execution.durationMs / 1000).toFixed(1)}s
                  </dd>
                </div>
              )}
              {runDir && (
                <div className="flex flex-col gap-1 rounded-xl border border-[#2A2E36] bg-[#16181D] p-3">
                  <dt className="text-xs text-[#B3B7C2] uppercase tracking-wide">Run Directory</dt>
                  <dd className="font-mono text-[10px] text-[#B3B7C2] break-all">{runDir}</dd>
                </div>
              )}
            </dl>
          </GlassPanel>

          {execution?.input && (
            <GlassPanel className="p-5">
              <SectionHeader eyebrow="Configuration" title="Execution Input" />
              <div className="w-full overflow-x-auto rounded-xl border border-[#2A2E36] bg-black/40">
                <pre className="min-w-0 whitespace-pre-wrap break-words p-4 text-sm font-mono text-[#B3B7C2] max-h-[220px] overflow-y-auto">
                  {JSON.stringify(execution.input, null, 2)}
                </pre>
              </div>
            </GlassPanel>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
