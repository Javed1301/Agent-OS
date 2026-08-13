"use client";

import React, { useState, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AppShell,
  GlassPanel,
  SectionHeader,
  PrimaryButton,
  SecondaryButton,
} from "@/components/primitives";
import { listSecrets, setSecret, deleteSecret, listAgents } from "@/lib/api";

const RECOMMENDED_KEYS = [
  { name: "GEMINI_API_KEY", description: "Required by Podcaster Crew, Code Generator, and Gemini-based agents." },
  { name: "OPENROUTER_API_KEY", description: "Required by Stock Analyst and multi-LLM reasoning agents." },
  { name: "EXA_API_KEY", description: "Required by Stock Analyst for real-time web search capabilities." },
  { name: "SERPER_API_KEY", description: "Optional web search integration key for search-enabled agents." },
];

function SecretsContent() {
  const searchParams = useSearchParams();
  const initialKey = searchParams.get("key") || "";

  const queryClient = useQueryClient();
  const [secretName, setSecretName] = useState(initialKey);
  const [secretValue, setSecretValue] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Queries
  const { data: vaultSecrets = [], isLoading: isLoadingSecrets } = useQuery({
    queryKey: ["secrets"],
    queryFn: listSecrets,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: listAgents,
  });

  // Map which agents use which secrets
  const agentsMap = React.useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const agent of agents) {
      const req = agent.secrets?.required || agent.healthCheck?.requiredEnv || [];
      const opt = agent.secrets?.optional || [];
      const allKeys = Array.from(new Set([...req, ...opt]));
      for (const k of allKeys) {
        if (!map[k]) map[k] = [];
        map[k].push(agent.name);
      }
    }
    return map;
  }, [agents]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secretName.trim() || !secretValue.trim()) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      await setSecret(secretName.trim().toUpperCase(), secretValue.trim());
      setFeedback({ type: "success", message: `Secret '${secretName.trim().toUpperCase()}' encrypted and saved.` });
      setSecretName("");
      setSecretValue("");
      queryClient.invalidateQueries({ queryKey: ["secrets"] });
      queryClient.invalidateQueries({ queryKey: ["agent-health"] });
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to save secret." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Are you sure you want to remove the secret '${name}'?`)) return;

    try {
      await deleteSecret(name);
      queryClient.invalidateQueries({ queryKey: ["secrets"] });
      queryClient.invalidateQueries({ queryKey: ["agent-health"] });
    } catch (err: any) {
      alert(err.message || "Failed to delete secret.");
    }
  };

  const handleSelectKey = (name: string) => {
    setSecretName(name);
    setFeedback(null);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in">

      {/* Hero Info Panel */}
      <GlassPanel className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-[#F5F5F7]">Local Encrypted Secrets Vault</h2>
            <p className="text-xs text-[#B3B7C2] leading-relaxed max-w-3xl">
              Store API keys and environment credentials locally in an <strong>AES-256-GCM encrypted vault</strong> (`/app/data/secrets/vault.json`).
              Secrets are injected dynamically into Python subprocesses at runtime and are <strong>never stored in manifests, logged in streams, or exposed in API responses</strong>.
            </p>
          </div>
          <span className="rounded-md border border-[#2DD4BF]/40 bg-[#2DD4BF]/10 px-2.5 py-1 text-xs font-mono text-[#2DD4BF]">
            🔒 Local Encryption Active
          </span>
        </div>
      </GlassPanel>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">

        {/* LEFT: Existing Secrets & Usage */}
        <div className="space-y-6">
          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Stored Keys" title="Active Credentials" />

            {isLoadingSecrets ? (
              <div className="flex items-center gap-2 py-6 text-xs text-[#B3B7C2]">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-[#C7A66B] border-t-transparent animate-spin" />
                Decrypting vault metadata...
              </div>
            ) : vaultSecrets.length === 0 ? (
              <div className="rounded-xl border border-[#2A2E36] bg-[#0B0D11] p-6 text-center">
                <p className="text-xs text-[#B3B7C2]">No custom secrets saved in local vault yet.</p>
                <p className="text-[11px] text-[#6E7482] mt-1">Use the form on the right to add your API keys.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {vaultSecrets.map((sec) => {
                  const usedBy = agentsMap[sec.name] || [];
                  return (
                    <div
                      key={sec.name}
                      className="rounded-xl border border-[#2A2E36] bg-[#16181D] p-4 flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-[#F5F5F7]">{sec.name}</span>
                          <span className="rounded-full border border-[#2DD4BF]/30 bg-[#2DD4BF]/10 px-2 py-0.5 text-[10px] font-semibold text-[#2DD4BF]">
                            Connected
                          </span>
                          <span className="font-mono text-[10px] text-[#6E7482]">••••••••••••</span>
                        </div>

                        {usedBy.length > 0 ? (
                          <p className="text-[11px] text-[#B3B7C2]">
                            <span className="text-[#6E7482]">Used by: </span>
                            {usedBy.join(", ")}
                          </p>
                        ) : (
                          <p className="text-[11px] text-[#6E7482]">Not explicitly declared by active workspace agents.</p>
                        )}

                        <p className="text-[10px] text-[#6E7482]">Updated: {sec.lastUpdated}</p>
                      </div>

                      <div className="flex gap-2 shrink-0">
                        <SecondaryButton
                          onClick={() => handleSelectKey(sec.name)}
                          className="text-xs py-1 px-2.5"
                        >
                          Edit
                        </SecondaryButton>
                        <SecondaryButton
                          onClick={() => handleDelete(sec.name)}
                          className="text-xs py-1 px-2.5 text-red-300 hover:border-red-500/40 hover:bg-red-950/20"
                        >
                          Delete
                        </SecondaryButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </GlassPanel>

          {/* Quick Preset Recommendations */}
          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Quick Presets" title="Common Agent Credentials" />
            <div className="grid gap-2.5 sm:grid-cols-2">
              {RECOMMENDED_KEYS.map((rec) => {
                const isConfigured = vaultSecrets.some((s) => s.name === rec.name);
                return (
                  <button
                    key={rec.name}
                    onClick={() => handleSelectKey(rec.name)}
                    className={`text-left rounded-xl border p-3 transition cursor-pointer ${
                      isConfigured
                        ? "border-[#2DD4BF]/30 bg-[#2DD4BF]/5 hover:border-[#2DD4BF]/60"
                        : "border-[#2A2E36] bg-[#16181D] hover:border-[#C7A66B]/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-mono text-xs font-semibold text-[#F5F5F7]">{rec.name}</span>
                      {isConfigured ? (
                        <span className="text-[10px] text-[#2DD4BF] font-semibold">✓ Saved</span>
                      ) : (
                        <span className="text-[10px] text-[#C7A66B] font-semibold">+ Add</span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#6E7482] leading-snug">{rec.description}</p>
                  </button>
                );
              })}
            </div>
          </GlassPanel>
        </div>

        {/* RIGHT: Form to Add/Edit Secret */}
        <div>
          <GlassPanel className="p-5 sticky top-6">
            <SectionHeader eyebrow="Vault Action" title="Save Encrypted Secret" />

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label htmlFor="secret-name" className="block text-xs font-semibold text-[#F5F5F7] mb-1.5">
                  Secret Key Name
                </label>
                <input
                  id="secret-name"
                  type="text"
                  required
                  placeholder="e.g. GEMINI_API_KEY"
                  value={secretName}
                  onChange={(e) => setSecretName(e.target.value)}
                  className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-3.5 py-2.5 text-xs font-mono text-[#F5F5F7] uppercase focus:border-[#C7A66B] focus:outline-none"
                />
                <p className="text-[10px] text-[#6E7482] mt-1">Key names are converted to uppercase automatically.</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="secret-value" className="block text-xs font-semibold text-[#F5F5F7]">
                    Secret Value
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[11px] text-[#C7A66B] hover:underline cursor-pointer"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <input
                  id="secret-value"
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Paste your secret value / API key..."
                  value={secretValue}
                  onChange={(e) => setSecretValue(e.target.value)}
                  className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-3.5 py-2.5 text-xs font-mono text-[#F5F5F7] focus:border-[#C7A66B] focus:outline-none"
                />
              </div>

              {feedback && (
                <div
                  className={`rounded-xl border p-3 text-xs ${
                    feedback.type === "success"
                      ? "border-[#2DD4BF]/40 bg-[#2DD4BF]/10 text-[#2DD4BF]"
                      : "border-red-500/40 bg-red-950/20 text-red-300"
                  }`}
                >
                  {feedback.message}
                </div>
              )}

              <PrimaryButton type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? "Encrypting & Saving..." : "💾 Encrypt & Save to Vault"}
              </PrimaryButton>
            </form>
          </GlassPanel>
        </div>

      </div>

    </div>
  );
}

export default function SecretsPage() {
  return (
    <AppShell
      title="Platform Secrets Vault"
      topActions={
        <div className="flex gap-2">
          <Link href="/settings">
            <SecondaryButton>← Back to Settings</SecondaryButton>
          </Link>
          <Link href="/agents">
            <SecondaryButton>Registry</SecondaryButton>
          </Link>
        </div>
      }
    >
      <Suspense fallback={<div className="p-8 text-center text-xs text-[#B3B7C2]">Loading Secrets Vault...</div>}>
        <SecretsContent />
      </Suspense>
    </AppShell>
  );
}
