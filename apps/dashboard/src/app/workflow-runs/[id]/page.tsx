"use client";

import React, { useEffect, useState, useRef } from "react";
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
import { getWorkflowRun, cancelWorkflowRun, getWorkflow, listArtifacts, getArtifact } from "@/lib/api";
import { StepRunRecord } from "@/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

function highlightCode(code: string, language: string) {
  if (language === "markdown" || language === "plaintext") {
    return <span className="text-[#F5F5F7]">{code}</span>;
  }

  // Regex tokens: string, number, keyword, builtin, comment
  let tokenRegex: RegExp;
  if (language === "python") {
    tokenRegex = /(#[^\n]*)|(""[\s\S]*?"""|'''[\s\S]*?'''|"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')|\b(def|class|return|import|from|as|if|elif|else|for|with|in|and|or|not|is|pass|self|try|except|raise|lambda|async|await)\b|\b(print|len|range|str|int|dict|list|set|tuple|bool|float|open|True|False|None)\b|\b(\d+(?:\.\d+)?)\b/g;
  } else if (language === "json" || language === "yaml" || language === "yml") {
    tokenRegex = /("[^"\\]*(?:\\.[^"\\]*)*"\s*:)|("[^"\\]*(?:\\.[^"\\]*)*")|\b(true|false|null)\b|\b(\d+(?:\.\d+)?)\b/g;
  } else {
    return <span className="text-[#F5F5F7]">{code}</span>;
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  // Reset regex
  tokenRegex.lastIndex = 0;

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      parts.push(code.substring(lastIndex, match.index));
    }

    const value = match[0];

    if (language === "python") {
      if (value.startsWith("#")) {
        parts.push(<span key={match.index} className="text-[#6E7482] italic">{value}</span>);
      } else if (value.startsWith('"') || value.startsWith("'")) {
        parts.push(<span key={match.index} className="text-[#2DD4BF]">{value}</span>);
      } else if (/\b(def|class|return|import|from|as|if|elif|else|for|with|in|and|or|not|is|pass|self|try|except|raise|lambda|async|await)\b/.test(value)) {
        parts.push(<span key={match.index} className="text-[#7A5AF8] font-bold">{value}</span>);
      } else if (/\b(print|len|range|str|int|dict|list|set|tuple|bool|float|open|True|False|None)\b/.test(value)) {
        parts.push(<span key={match.index} className="text-[#E2C48D]">{value}</span>);
      } else if (/\b(\d+(?:\.\d+)?)\b/.test(value)) {
        parts.push(<span key={match.index} className="text-amber-400">{value}</span>);
      } else {
        parts.push(value);
      }
    } else {
      // json / yaml / yml
      if (value.startsWith('"')) {
        if (value.endsWith(":")) {
          parts.push(<span key={match.index} className="text-[#7A5AF8] font-semibold">{value}</span>);
        } else {
          parts.push(<span key={match.index} className="text-[#2DD4BF]">{value}</span>);
        }
      } else if (/\b(true|false|null)\b/.test(value)) {
        parts.push(<span key={match.index} className="text-[#E2C48D]">{value}</span>);
      } else if (/\b(\d+(?:\.\d+)?)\b/.test(value)) {
        parts.push(<span key={match.index} className="text-amber-400">{value}</span>);
      } else {
        parts.push(value);
      }
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < code.length) {
    parts.push(code.substring(lastIndex));
  }

  return <>{parts}</>;
}

export default function WorkflowRunPage({ params }: PageProps) {
  const { id } = React.use(params);
  const router = useRouter();

  // Workflow run state
  const [status, setStatus] = useState<string>("queued");
  const [steps, setSteps] = useState<StepRunRecord[]>([]);
  const [stepLogs, setStepLogs] = useState<Record<string, string[]>>({});
  const [selectedStepId, setSelectedStepId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Artifact state
  const [artifacts, setArtifacts] = useState<string[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(null);
  const [artifactContent, setArtifactContent] = useState<string | null>(null);
  const [artifactLanguage, setArtifactLanguage] = useState<string>("plaintext");
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [isLoadingArtifact, setIsLoadingArtifact] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  const handleScroll = () => {
    const el = terminalRef.current;
    if (!el) return;
    const threshold = 40;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    userScrolledUp.current = !atBottom;
    if (atBottom) setAutoScroll(true);
  };

  // Fetch initial state
  const { data: run, refetch: refetchRun } = useQuery({
    queryKey: ["workflow-run", id],
    queryFn: () => getWorkflowRun(id),
  });

  const workflowId = run?.workflowId || "";
  const { data: workflow } = useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: () => getWorkflow(workflowId),
    enabled: !!workflowId,
  });

  // Load existing states on query resolve
  useEffect(() => {
    if (run) {
      setStatus(run.status);
      setSteps(run.steps || []);
      if (run.error) setError(run.error);

      // If finished, load artifacts list
      if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
        listArtifacts(id)
          .then((files) => setArtifacts(files))
          .catch((err) => console.error("Error loading artifacts:", err));

        // Load steps logs from backend files if finished
        run.steps.forEach((step) => {
          const stepLogUrl = `${process.env.NEXT_PUBLIC_GATEWAY_URL || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000"}/api/executions/${step.executionId}/logs`;
          if (step.executionId) {
            fetch(stepLogUrl)
              .then((res) => res.json())
              .then((data) => {
                if (data.logs) {
                  const lines = data.logs
                    .split("\n")
                    .filter((l: string) => l.trim().length > 0)
                    .map((l: string) => l.substring(25)); // Strip timestamp
                  setStepLogs((prev) => ({ ...prev, [step.stepId]: lines }));
                }
              })
              .catch((err) => console.error(`Error loading logs for step ${step.stepId}:`, err));
          }
        });
      }
    }
  }, [run, id]);

  // Connect to SSE stream
  useEffect(() => {
    if (!run || run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
      return;
    }

    const apiBase = process.env.NEXT_PUBLIC_GATEWAY_URL || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
    const eventSource = new EventSource(`${apiBase}/api/workflow-runs/${id}/stream`);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { type, data } = payload;

        if (type === "workflow_started") {
          setStatus("running");
          refetchRun();
        } else if (type === "step_started") {
          const { stepId } = data;
          setSelectedStepId(stepId);
          setSteps((prev) =>
            prev.map((s) => (s.stepId === stepId ? { ...s, status: "running", startTime: new Date().toISOString() } : s))
          );
          refetchRun();
        } else if (type === "step_log") {
          const { stepId, log } = data;
          setStepLogs((prev) => {
            const currentLogs = prev[stepId] || [];
            return { ...prev, [stepId]: [...currentLogs, log] };
          });
        } else if (type === "step_completed") {
          const { stepId } = data;
          setSteps((prev) =>
            prev.map((s) => (s.stepId === stepId ? { ...s, status: "completed", endTime: new Date().toISOString() } : s))
          );
          refetchRun();
        } else if (type === "step_failed") {
          const { stepId, error: stepErr } = data;
          setSteps((prev) =>
            prev.map((s) => (s.stepId === stepId ? { ...s, status: "failed", error: stepErr, endTime: new Date().toISOString() } : s))
          );
          refetchRun();
        } else if (type === "workflow_completed") {
          setStatus("completed");
          if (data.artifacts) setArtifacts(data.artifacts);
          eventSource.close();
          refetchRun();
        } else if (type === "workflow_failed") {
          setStatus("failed");
          setError(data.error || "Workflow failed");
          eventSource.close();
          refetchRun();
        } else if (type === "workflow_cancelled") {
          setStatus("cancelled");
          eventSource.close();
          refetchRun();
        }
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };

    eventSource.onerror = () => {
      refetchRun().then((res) => {
        if (res.data && res.data.status !== "running" && res.data.status !== "queued") {
          eventSource.close();
        }
      });
    };

    return () => {
      eventSource.close();
    };
  }, [run, id, refetchRun]);

  // Set initial selected step log tab if not set
  useEffect(() => {
    if (steps.length > 0 && !selectedStepId) {
      // Find the first step that is running or completed
      const activeStep = steps.find((s) => s.status === "running") || steps.find((s) => s.status === "completed") || steps[0];
      setSelectedStepId(activeStep.stepId);
    }
  }, [steps, selectedStepId]);

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && !userScrolledUp.current) {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [stepLogs, selectedStepId, autoScroll]);

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      await cancelWorkflowRun(id);
      setStatus("cancelled");
      refetchRun();
    } catch (err: any) {
      console.error("Failed to cancel workflow:", err);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleOpenArtifact = async (path: string) => {
    setSelectedArtifact(path);
    setIsLoadingArtifact(true);
    setArtifactContent(null);
    setArtifactError(null);
    try {
      const res = await getArtifact(id, path);
      setArtifactContent(res.content);
      setArtifactLanguage(res.language);
    } catch (err: any) {
      setArtifactError(err.message || "Failed to load artifact content.");
    } finally {
      setIsLoadingArtifact(false);
    }
  };

  // Simple Custom Markdown Renderer
  const renderMarkdown = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      if (line.startsWith("# ")) {
        return <h1 key={idx} className="text-xl font-bold border-b border-[#2A2E36] pb-1 mt-4 mb-2 text-[#F5F5F7]">{line.substring(2)}</h1>;
      }
      if (line.startsWith("## ")) {
        return <h2 key={idx} className="text-lg font-bold mt-3 mb-1 text-[#F5F5F7]">{line.substring(3)}</h2>;
      }
      if (line.startsWith("### ")) {
        return <h3 key={idx} className="text-base font-semibold mt-2 mb-1 text-[#F5F5F7]">{line.substring(4)}</h3>;
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        return <li key={idx} className="list-disc pl-5 text-[#B3B7C2] text-xs mt-0.5">{line.substring(2)}</li>;
      }
      if (line.trim().startsWith(">")) {
        return <blockquote key={idx} className="border-l-2 border-[#C7A66B] bg-[#16181D] pl-3 py-1 italic text-xs text-[#B3B7C2] my-2">{line.substring(1).trim()}</blockquote>;
      }
      if (line.trim().length === 0) {
        return <div key={idx} className="h-2" />;
      }
      return <p key={idx} className="text-xs text-[#B3B7C2] leading-relaxed my-1">{line}</p>;
    });
  };

  const getStepStatusBadge = (sStatus: string) => {
    switch (sStatus) {
      case "completed":
        return "text-[#2DD4BF] border-[#2DD4BF]/30 bg-[#2DD4BF]/5";
      case "running":
        return "text-[#E2C48D] border-[#C7A66B]/50 bg-[#C7A66B]/5 animate-pulse";
      case "failed":
        return "text-red-300 border-red-950 bg-red-900/10";
      case "cancelled":
        return "text-[#B3B7C2] border-[#2A2E36] bg-[#16181D]/30";
      default:
        return "text-[#B3B7C2] border-[#2A2E36] bg-[#16181D]/10";
    }
  };

  const getStatusColor = (statusVal: string) => {
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

  const currentLogs = stepLogs[selectedStepId] || [];

  return (
    <AppShell
      title={`Workflow Engine: ${workflow ? workflow.name : "Run Detail"}`}
      topActions={
        <div className="flex gap-2">
          {status === "running" && (
            <SecondaryButton onClick={handleCancel} disabled={isCancelling}>
              {isCancelling ? "Stopping..." : "Cancel Run"}
            </SecondaryButton>
          )}
          <Link href="/executions">
            <SecondaryButton>Operations Log</SecondaryButton>
          </Link>
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] animate-fade-in">
        <div className="space-y-6 min-w-0">
          {/* Timeline and logs */}
          <GlassPanel className="p-5 flex flex-col h-[520px] overflow-hidden">
            <div className="border-b border-[#2A2E36] pb-3 mb-3 flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.2em] text-[#B3B7C2]">
                Workflow Timeline & Logs
              </span>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs text-[#B3B7C2] cursor-pointer">
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
                <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium tracking-wide uppercase ${getStatusColor(status)}`}>
                  {status}
                </span>
              </div>
            </div>

            {/* Step navigation tabs */}
            <div className="flex gap-1.5 border-b border-[#2A2E36] pb-2 mb-3 overflow-x-auto">
              {steps.map((step) => (
                <button
                  key={step.stepId}
                  onClick={() => setSelectedStepId(step.stepId)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-mono transition flex items-center gap-2 cursor-pointer ${
                    selectedStepId === step.stepId
                      ? "border-[#C7A66B]/60 bg-[#C7A66B]/15 text-[#E2C48D]"
                      : "border-transparent text-[#B3B7C2] hover:bg-[#16181D]"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    step.status === "completed" ? "bg-[#2DD4BF]" : step.status === "running" ? "bg-[#C7A66B] animate-ping" : step.status === "failed" ? "bg-red-500" : "bg-gray-500"
                  }`} />
                  {step.stepId}
                </button>
              ))}
            </div>

            {/* Selected step terminal */}
            <div className="flex-1 min-h-0 rounded-2xl bg-black border border-[#1C1F26] overflow-hidden flex flex-col">
              <div
                ref={terminalRef}
                onScroll={handleScroll}
                className="h-full overflow-y-auto overflow-x-auto p-4 font-mono text-xs text-[#E2C48D] leading-6 space-y-0.5"
              >
                {selectedStepId ? (
                  <>
                    <div className="text-[#6E7482] border-b border-[#2A2E36] pb-1 mb-2 shrink-0">
                      Logs for step [{selectedStepId}] (Execution: {steps.find(s => s.stepId === selectedStepId)?.executionId || "N/A"})
                    </div>
                    {currentLogs.length === 0 ? (
                      <div className="text-[#6E7482] italic">No logs emitted for this step yet.</div>
                    ) : (
                      currentLogs.map((line, idx) => (
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
                  </>
                ) : (
                  <div className="text-[#6E7482] italic">Select a step tab above to view active runtime logs.</div>
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          </GlassPanel>

          {/* Artifacts Viewer section */}
          {(status === "completed" || artifacts.length > 0) && (
            <GlassPanel className="p-6">
              <SectionHeader eyebrow="Explorer" title="Workflow Artifact Outputs" />
              <p className="text-xs text-[#B3B7C2] mb-4">
                These code, review, or markdown files were produced during the run. Click on any file to view content securely in the inspector panel.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {artifacts.map((filePath) => {
                  const isMd = filePath.endsWith(".md");
                  const isPy = filePath.endsWith(".py");
                  return (
                    <button
                      key={filePath}
                      onClick={() => handleOpenArtifact(filePath)}
                      className="rounded-xl border border-[#2A2E36] bg-[#16181D] p-3 text-left transition duration-300 hover:border-[#7A5AF8]/60 hover:bg-[#1E2128] cursor-pointer group flex items-start gap-2.5 min-w-0"
                    >
                      <span className="text-lg flex-shrink-0 mt-0.5">
                        {isMd ? "📄" : isPy ? "🐍" : "📁"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-[#F5F5F7] group-hover:text-white truncate">
                          {filePath.split("/").pop()}
                        </p>
                        <p className="text-[10px] text-[#B3B7C2] truncate font-mono">
                          {filePath}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </GlassPanel>
          )}

          {error && (
            <GlassPanel className="p-6 border-red-500/20 bg-red-950/10">
              <SectionHeader eyebrow="Diagnostic Alert" title="Workflow Failure Reason" />
              <div className="w-full overflow-x-auto rounded-3xl border border-border bg-black/40">
                <pre className="min-w-0 whitespace-pre-wrap break-words p-4 text-sm font-mono text-red-300">
                  {error}
                </pre>
              </div>
            </GlassPanel>
          )}
        </div>

        <aside className="space-y-4 min-w-0">
          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Run Information" title="Timeline Details" />
            <dl className="space-y-3.5 text-sm">
              <div className="flex flex-col gap-1 rounded-xl border border-[#2A2E36] bg-[#16181D] p-3">
                <dt className="text-xs text-[#B3B7C2] uppercase tracking-wide">Workflow Run ID</dt>
                <dd className="font-mono text-xs text-[#F5F5F7] select-all">{id}</dd>
              </div>
              <div className="flex flex-col gap-1 rounded-xl border border-[#2A2E36] bg-[#16181D] p-3">
                <dt className="text-xs text-[#B3B7C2] uppercase tracking-wide">Template Graph</dt>
                <dd className="font-semibold text-[#F5F5F7]">
                  {workflow ? workflow.name : run?.workflowId || "Loading..."}
                </dd>
              </div>
              <div className="flex flex-col gap-1 rounded-xl border border-[#2A2E36] bg-[#16181D] p-3">
                <dt className="text-xs text-[#B3B7C2] uppercase tracking-wide">Start Time</dt>
                <dd className="font-semibold text-[#F5F5F7]">
                  {run ? new Date(run.startTime).toLocaleString() : "N/A"}
                </dd>
              </div>
              {run?.durationMs && (
                <div className="flex flex-col gap-1 rounded-xl border border-[#2A2E36] bg-[#16181D] p-3">
                  <dt className="text-xs text-[#B3B7C2] uppercase tracking-wide">Execution Duration</dt>
                  <dd className="font-semibold text-[#F5F5F7]">
                    {(run.durationMs / 1000).toFixed(1)} seconds
                  </dd>
                </div>
              )}
            </dl>
          </GlassPanel>

          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Timeline Steps" title="Pipeline Progress" />
            <ul className="space-y-2">
              {steps.map((step, idx) => (
                <li
                  key={step.stepId}
                  className={`rounded-xl border p-3 flex items-center justify-between ${
                    selectedStepId === step.stepId ? "border-[#C7A66B]/50 bg-[#16181D]" : "border-[#2A2E36] bg-[#0F1115]"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="h-5 w-5 rounded-full bg-[#08090B] border border-[#2A2E36] flex items-center justify-center font-semibold text-[10px] text-[#B3B7C2]">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-xs text-[#F5F5F7] font-mono">{step.stepId}</p>
                      {step.executionId && (
                        <p className="text-[9px] text-[#B3B7C2] font-mono leading-none mt-0.5">
                          ID: {step.executionId.substring(0, 15)}...
                        </p>
                      )}
                    </div>
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] border font-mono uppercase tracking-wide font-medium ${getStepStatusBadge(step.status)}`}>
                    {step.status}
                  </span>
                </li>
              ))}
            </ul>
          </GlassPanel>
        </aside>
      </div>

      {/* Slide-over Side Panel for File content inspection */}
      {selectedArtifact && (
        <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-[#08090B]/60 backdrop-blur-sm transition-opacity" onClick={() => setSelectedArtifact(null)} />
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-full max-w-2xl">
              <div className="h-full flex flex-col bg-[#0F1115] border-l border-[#2A2E36] shadow-2xl overflow-y-auto">
                <div className="p-5 border-b border-[#2A2E36] flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-[#F5F5F7] truncate max-w-md">
                      {selectedArtifact.split("/").pop()}
                    </h3>
                    <p className="text-xs text-[#B3B7C2] font-mono mt-0.5">{selectedArtifact}</p>
                  </div>
                  <SecondaryButton onClick={() => setSelectedArtifact(null)}>
                    Close Inspector
                  </SecondaryButton>
                </div>
                <div className="flex-1 p-6 overflow-y-auto">
                  {isLoadingArtifact ? (
                    <div className="flex h-48 items-center justify-center text-sm text-[#B3B7C2]">
                      Loading artifact contents...
                    </div>
                  ) : artifactError ? (
                    <div className="rounded-xl border border-red-500/50 bg-red-950/20 p-4 text-xs text-red-300">
                      Error: {artifactError}
                    </div>
                  ) : artifactContent !== null ? (
                    selectedArtifact.endsWith(".md") ? (
                      <div className="prose prose-invert max-w-full">
                        {renderMarkdown(artifactContent)}
                      </div>
                    ) : (
                      <div className="flex flex-col h-[520px] min-h-0 rounded-2xl bg-black border border-[#2A2E36] overflow-hidden">
                        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto p-4 bg-black">
                          <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-[#E2C48D] font-mono">
                            {highlightCode(artifactContent, artifactLanguage)}
                          </pre>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="text-sm text-red-300">No content available.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
