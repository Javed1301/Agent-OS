"use client";

import React from "react";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  AppShell,
  GlassPanel,
  SectionHeader,
  PrimaryButton,
  SecondaryButton,
} from "@/components/primitives";
import { listAgents, getAgentHealth, importAgent } from "@/lib/api";
import { AgentDefinition, AgentStatus } from "@/types";

type ViewMode = "grid" | "list";

// ─── Import Modal ────────────────────────────────────────────────────────────

function ImportModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [folderPath, setFolderPath] = React.useState("");
  const [state, setState] = React.useState<"idle" | "loading" | "success" | "error">("idle");
  const [resultMsg, setResultMsg] = React.useState("");
  const [importedAgent, setImportedAgent] = React.useState<AgentDefinition | null>(null);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderPath.trim()) return;
    setState("loading");
    setResultMsg("");
    try {
      const agent = await importAgent(folderPath.trim());
      setImportedAgent(agent);
      setState("success");
      setResultMsg(`Agent "${agent.name}" (${agent.id}) imported successfully.`);
      onSuccess();
    } catch (err: any) {
      setState("error");
      setResultMsg(err.message || "Import failed.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="import-modal-title">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-[#C7A66B]/25 bg-[#0F1115] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.7)]">
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#B3B7C2] mb-1">Agent Registry</p>
          <h2 id="import-modal-title" className="text-lg font-semibold text-[#F5F5F7]">Import Existing Agent</h2>
        </div>

        <p className="text-xs text-[#B3B7C2] mb-4 leading-relaxed">
          Paste the <strong className="text-[#F5F5F7]">absolute path</strong> to the folder containing your agent.
          The folder must have an <code className="text-[#E2C48D] bg-[#16181D] px-1 rounded">agent.yaml</code> file.
          The agent will remain in its original location — nothing is copied.
        </p>

        <form onSubmit={handleImport} className="space-y-4">
          <div>
            <label htmlFor="import-folder-path" className="block text-xs font-medium text-[#F5F5F7] mb-1.5">
              Agent Folder Path
            </label>
            <input
              id="import-folder-path"
              type="text"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="D:\AI\agents\my-stock-crew  or  /home/user/agents/pdf-bot"
              disabled={state === "loading" || state === "success"}
              className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-4 py-2.5 text-sm font-mono text-[#F5F5F7] placeholder:text-[#3D4150] focus:border-[#C7A66B]/60 focus:outline-none disabled:opacity-60"
            />
            <p className="mt-1.5 text-[11px] text-[#6E7482]">
              Example: <code>D:\AI\agents\stock-crew</code> or <code>/home/ubuntu/agents/rag-bot</code>
            </p>
          </div>

          {state === "loading" && (
            <div className="rounded-xl border border-[#C7A66B]/20 bg-[#C7A66B]/5 p-3.5">
              <div className="flex items-center gap-2.5">
                <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-[#C7A66B] border-t-transparent animate-spin" />
                <span className="text-xs text-[#E2C48D]">Validating manifest and resolving interpreter...</span>
              </div>
            </div>
          )}

          {state === "success" && (
            <div className="rounded-xl border border-[#2DD4BF]/30 bg-[#2DD4BF]/5 p-3.5">
              <p className="text-xs font-semibold text-[#2DD4BF] mb-1.5">✓ {resultMsg}</p>
              {importedAgent && (
                <dl className="space-y-1 text-[11px]">
                  <div className="flex gap-2">
                    <dt className="text-[#B3B7C2] min-w-[80px]">Type:</dt>
                    <dd className="text-[#F5F5F7] font-mono">{importedAgent.type}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-[#B3B7C2] min-w-[80px]">Interpreter:</dt>
                    <dd className="text-[#F5F5F7] font-mono truncate">{importedAgent.interpreterPath || "system python"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-[#B3B7C2] min-w-[80px]">Capabilities:</dt>
                    <dd className="text-[#F5F5F7]">{importedAgent.capabilities.join(", ") || "none"}</dd>
                  </div>
                </dl>
              )}
            </div>
          )}

          {state === "error" && (
            <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-3.5">
              <p className="text-xs font-semibold text-red-300 mb-0.5">Import failed</p>
              <p className="text-[11px] text-red-300/80">{resultMsg}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <SecondaryButton type="button" onClick={onClose}>
              {state === "success" ? "Close" : "Cancel"}
            </SecondaryButton>
            {state !== "success" && (
              <PrimaryButton type="submit" disabled={state === "loading" || !folderPath.trim()}>
                {state === "loading" ? "Importing..." : "Import Agent"}
              </PrimaryButton>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Registry Page ───────────────────────────────────────────────────────

export default function AgentRegistry() {
  const queryClient = useQueryClient();
  const [query, setQuery] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState<string>("All");
  const [viewMode, setViewMode] = React.useState<ViewMode>("grid");
  const [showImport, setShowImport] = React.useState(false);

  const { data: agents = [], isLoading, refetch } = useQuery({
    queryKey: ["agents"],
    queryFn: listAgents,
  });

  // Fetch health check for all agents in parallel
  const healthQueries = useQueries({
    queries: agents.map((agent) => ({
      queryKey: ["agent-health", agent.id],
      queryFn: () => getAgentHealth(agent.id),
      staleTime: 15000,
    })),
  });

  const handleSync = async () => {
    await refetch();
    healthQueries.forEach((q) => q.refetch());
  };

  const handleImportSuccess = () => {
    // Invalidate agents cache so the new agent appears
    queryClient.invalidateQueries({ queryKey: ["agents"] });
  };

  // Dynamically extract categories
  const categories = React.useMemo(() => {
    const list = new Set(agents.map((a) => a.category));
    return ["All", ...Array.from(list)];
  }, [agents]);

  // Filters
  const filteredAgents = React.useMemo(() => {
    const search = query.trim().toLowerCase();
    return agents.filter((agent) => {
      const byCategory =
        selectedCategory === "All" || agent.category === selectedCategory;

      const byQuery =
        search.length === 0 ||
        agent.name.toLowerCase().includes(search) ||
        agent.description.toLowerCase().includes(search) ||
        agent.category.toLowerCase().includes(search) ||
        agent.capabilities.some((c) => c.toLowerCase().includes(search));

      return byCategory && byQuery;
    });
  }, [agents, query, selectedCategory]);

  const healthyCount = healthQueries.filter(
    (q) => q.data?.status === "available"
  ).length;

  const externalCount = agents.filter((a) => a.isExternal).length;

  return (
    <>
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            handleImportSuccess();
            // Keep modal open to show success state
          }}
        />
      )}

      <AppShell
        title="Agent Registry"
        topActions={
          <div className="flex gap-2">
            <SecondaryButton
              aria-label="Import existing agent from local folder"
              onClick={() => setShowImport(true)}
              id="import-agent-btn"
            >
              + Import Agent
            </SecondaryButton>
            <SecondaryButton aria-label="Sync registry health" onClick={handleSync}>
              Sync Health
            </SecondaryButton>
          </div>
        }
      >
        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-sm text-[#B3B7C2]">
            Loading registry configurations...
          </div>
        ) : (
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)] animate-fade-in">
            <div className="space-y-4 min-w-0">
              <GlassPanel className="p-5">
                <SectionHeader eyebrow="Registry" title="Available Node Agents" />
                <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
                  <label className="block">
                    <span className="sr-only">Search registry agents</span>
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by name, category, or capability..."
                      className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-4 py-2 text-sm text-[#F5F5F7] placeholder:text-[#6E7482] focus:border-[#7A5AF8] focus:outline-none"
                    />
                  </label>
                  <div
                    className="inline-flex rounded-xl border border-[#2A2E36] bg-[#16181D] p-1"
                    role="tablist"
                    aria-label="Registry view mode"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={viewMode === "grid"}
                      onClick={() => setViewMode("grid")}
                      className={`rounded-lg px-3 py-1.5 text-xs uppercase tracking-[0.14em] transition cursor-pointer ${
                        viewMode === "grid"
                          ? "bg-[#C7A66B]/20 text-[#E2C48D]"
                          : "text-[#B3B7C2] hover:text-[#F5F5F7]"
                      }`}
                    >
                      Grid
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={viewMode === "list"}
                      onClick={() => setViewMode("list")}
                      className={`rounded-lg px-3 py-1.5 text-xs uppercase tracking-[0.14em] transition cursor-pointer ${
                        viewMode === "list"
                          ? "bg-[#C7A66B]/20 text-[#E2C48D]"
                          : "text-[#B3B7C2] hover:text-[#F5F5F7]"
                      }`}
                    >
                      List
                    </button>
                  </div>
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setSelectedCategory(category)}
                      className={`rounded-full border px-3.5 py-1.5 text-xs uppercase tracking-[0.12em] transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer ${
                        selectedCategory === category
                          ? "border-[#C7A66B]/60 bg-[#C7A66B]/15 text-[#E2C48D]"
                          : "border-[#2A2E36] bg-[#16181D] text-[#B3B7C2] hover:border-[#7A5AF8]/45 hover:text-[#F5F5F7]"
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>

                {filteredAgents.length === 0 ? (
                  <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-[#2A2E36] gap-3 text-sm text-[#B3B7C2]">
                    <p>No agents match the filter or search query.</p>
                    <button
                      onClick={() => setShowImport(true)}
                      className="text-[#E2C48D] hover:text-[#C7A66B] text-xs underline underline-offset-2 cursor-pointer"
                    >
                      Import an agent from a local folder →
                    </button>
                  </div>
                ) : viewMode === "grid" ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {filteredAgents.map((agent) => {
                      const health = healthQueries.find(
                        (q) => q.data?.agentId === agent.id
                      )?.data;
                      const statusText: AgentStatus = health?.status || "unknown";

                      return (
                        <Link key={agent.id} href={`/agents/${agent.id}`}>
                          <GlassPanel className="p-4 transition duration-300 hover:-translate-y-0.5 hover:border-[#C7A66B]/40 cursor-pointer h-full flex flex-col justify-between">
                            <div>
                              <div className="mb-3 flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="text-base font-semibold text-[#F5F5F7] truncate">
                                      {agent.name}
                                    </h3>
                                    {agent.isExternal && (
                                      <span className="rounded border border-[#7A5AF8]/30 bg-[#7A5AF8]/10 px-1.5 py-0.5 text-[10px] text-[#a68ff8] flex-shrink-0">
                                        External
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#B3B7C2]">
                                    {agent.category}
                                  </p>
                                </div>
                                <span
                                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide flex-shrink-0 ${
                                    statusText === "available"
                                      ? "text-[#2DD4BF] border-[#2DD4BF]/40 bg-[#2DD4BF]/10"
                                      : statusText === "warning"
                                      ? "text-[#E2C48D] border-[#C7A66B]/50 bg-[#C7A66B]/15"
                                      : statusText === "unavailable"
                                      ? "text-red-300 border-red-600/50 bg-red-900/20"
                                      : "text-[#B3B7C2] border-[#2A2E36] bg-[#16181D]"
                                  }`}
                                >
                                  {statusText}
                                </span>
                              </div>
                              <p className="mb-4 text-xs text-[#B3B7C2] line-clamp-2">
                                {agent.description}
                              </p>
                            </div>
                            <div>
                              <div className="flex flex-wrap gap-1 mb-4">
                                {agent.capabilities.slice(0, 3).map((cap) => (
                                  <span
                                    key={cap}
                                    className="rounded bg-[#16181D] border border-[#2A2E36] px-1.5 py-0.5 text-[10px] text-[#B3B7C2]"
                                  >
                                    {cap}
                                  </span>
                                ))}
                                {agent.capabilities.length > 3 && (
                                  <span className="text-[10px] text-[#6E7482] px-1">
                                    +{agent.capabilities.length - 3} more
                                  </span>
                                )}
                              </div>
                              <PrimaryButton className="w-full text-center block text-xs">
                                Inspect & Run
                              </PrimaryButton>
                            </div>
                          </GlassPanel>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {filteredAgents.map((agent) => {
                      const health = healthQueries.find(
                        (q) => q.data?.agentId === agent.id
                      )?.data;
                      const statusText: AgentStatus = health?.status || "unknown";

                      return (
                        <li
                          key={agent.id}
                          className="rounded-xl border border-[#232731] bg-[#0F1115] p-4 transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[#16181D]"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-base font-semibold text-[#F5F5F7] truncate">
                                  {agent.name}
                                </h3>
                                <span className="text-xs text-[#6E7482]">
                                  v{agent.version || "1.0.0"}
                                </span>
                                {agent.isExternal && (
                                  <span className="rounded border border-[#7A5AF8]/30 bg-[#7A5AF8]/10 px-1.5 py-0.5 text-[10px] text-[#a68ff8]">
                                    External
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] uppercase tracking-[0.16em] text-[#B3B7C2]">
                                {agent.category}
                              </p>
                              <p className="mt-2 text-sm text-[#B3B7C2]">
                                {agent.description}
                              </p>
                            </div>
                            <div className="flex flex-col items-end justify-between gap-4">
                              <span
                                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide ${
                                  statusText === "available"
                                    ? "text-[#2DD4BF] border-[#2DD4BF]/40 bg-[#2DD4BF]/10"
                                    : statusText === "warning"
                                    ? "text-[#E2C48D] border-[#C7A66B]/50 bg-[#C7A66B]/15"
                                    : statusText === "unavailable"
                                    ? "text-red-300 border-red-600/50 bg-red-900/20"
                                    : "text-[#B3B7C2] border-[#2A2E36] bg-[#16181D]"
                                }`}
                              >
                                {statusText}
                              </span>
                              <Link href={`/agents/${agent.id}`}>
                                <PrimaryButton className="text-xs">
                                  Inspect & Run
                                </PrimaryButton>
                              </Link>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </GlassPanel>
            </div>

            <aside className="space-y-4 min-w-0">
              <GlassPanel className="p-5">
                <SectionHeader eyebrow="Insights" title="Registry Overview" />
                <dl className="space-y-3 text-sm">
                  <div className="flex items-center justify-between rounded-lg border border-[#2A2E36] bg-[#16181D] px-3 py-2">
                    <dt className="text-[#B3B7C2]">Total Agents</dt>
                    <dd className="font-medium text-[#F5F5F7]">
                      {agents.length}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-[#2A2E36] bg-[#16181D] px-3 py-2">
                    <dt className="text-[#B3B7C2]">Healthy Nodes</dt>
                    <dd className="font-medium text-[#2DD4BF]">
                      {healthyCount} / {agents.length}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-[#2A2E36] bg-[#16181D] px-3 py-2">
                    <dt className="text-[#B3B7C2]">External Agents</dt>
                    <dd className="font-medium text-[#a68ff8]">
                      {externalCount}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-[#2A2E36] bg-[#16181D] px-3 py-2">
                    <dt className="text-[#B3B7C2]">Types</dt>
                    <dd className="font-medium text-[#E2C48D] text-xs">
                      {Array.from(new Set(agents.map((a) => a.type))).join(", ")}
                    </dd>
                  </div>
                </dl>
              </GlassPanel>

              <GlassPanel className="p-5">
                <SectionHeader eyebrow="Quick Actions" title="Import an Agent" />
                <p className="text-xs text-[#B3B7C2] mb-4 leading-relaxed">
                  Point to any local folder containing an <code className="text-[#E2C48D] bg-[#16181D] px-1 rounded">agent.yaml</code>.
                  The agent stays in its folder — nothing is copied to this workspace.
                </p>
                <button
                  onClick={() => setShowImport(true)}
                  className="w-full rounded-xl border border-dashed border-[#C7A66B]/40 bg-[#C7A66B]/5 p-4 text-center text-xs text-[#E2C48D] hover:bg-[#C7A66B]/10 transition cursor-pointer"
                  id="import-agent-dashed-btn"
                >
                  <span className="block text-xl mb-1.5">📂</span>
                  Click to import from local folder
                </button>
              </GlassPanel>

              <GlassPanel className="p-5">
                <SectionHeader eyebrow="agent.yaml" title="Minimal Manifest" />
                <pre className="text-[10px] font-mono text-[#E2C48D] leading-5 overflow-x-auto whitespace-pre">{`id: my-agent
name: My AI Agent
type: python
workingDirectory: D:/AI/my-agent
entrypoint: runner.py
capabilities:
  - text-analysis`}
                </pre>
              </GlassPanel>
            </aside>
          </section>
        )}
      </AppShell>
    </>
  );
}
