"use client";

import React, { useState, useEffect } from "react";
import {
  AppShell,
  GlassPanel,
  PrimaryButton,
  SectionHeader,
  SecondaryButton,
} from "@/components/primitives";
import { useTheme } from "@/components/ThemeContext";

interface SettingsState {
  displayName: string;
  email: string;
  workspaceName: string;
  timezone: string;
  digestEmail: boolean;
  pushAlerts: boolean;
  incidentOnly: boolean;
  apiKey: string;
  runtimeRegion: "us-east-1" | "eu-west-1";
}

export default function SettingsPage() {
  const { accent, theme, setAccent, setTheme } = useTheme();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Settings state stored in localStorage
  const [state, setState] = useState<SettingsState>({
    displayName: "Operator One",
    email: "operator@agentos.ai",
    workspaceName: "My Agent Workspace",
    timezone: "UTC-05:00",
    digestEmail: true,
    pushAlerts: true,
    incidentOnly: false,
    apiKey: "agnt_live_x7F2P9Q8",
    runtimeRegion: "us-east-1",
  });

  useEffect(() => {
    const saved = localStorage.getItem("settings_profile");
    if (saved) {
      try {
        setState(JSON.parse(saved));
      } catch (err) {
        console.error("Failed to parse settings profile:", err);
      }
    }
  }, []);

  const updateField = <K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K]
  ) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    localStorage.setItem("settings_profile", JSON.stringify(state));
    setSuccessMsg("Settings saved successfully.");
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleCancel = () => {
    const saved = localStorage.getItem("settings_profile");
    if (saved) {
      try {
        setState(JSON.parse(saved));
      } catch {}
    }
    setSuccessMsg(null);
  };

  return (
    <AppShell
      title="Settings"
      topActions={
        <div className="flex gap-2">
          <SecondaryButton aria-label="Discard changes" onClick={handleCancel}>
            Cancel
          </SecondaryButton>
          <PrimaryButton aria-label="Save settings" onClick={handleSave}>
            Save Changes
          </PrimaryButton>
        </div>
      }
    >
      <div className="space-y-6 animate-fade-in">
        {successMsg && (
          <div className="rounded-xl border border-[#2DD4BF]/40 bg-[#2DD4BF]/10 p-3.5 text-xs text-[#2DD4BF] font-semibold">
            ✔ {successMsg}
          </div>
        )}

        {/* Encrypted Secrets Vault Banner */}
        <GlassPanel className="p-5 border-[#C7A66B]/30 bg-[#C7A66B]/8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.16em] text-[#C7A66B] font-bold">Local Encryption</p>
              <h3 className="text-base font-bold text-[#F5F5F7]">Platform Secrets Vault</h3>
              <p className="text-xs text-[#B3B7C2]">
                Manage encrypted API keys (GEMINI_API_KEY, OPENROUTER_API_KEY, EXA_API_KEY) injected into agents at runtime.
              </p>
            </div>
            <a href="/settings/secrets">
              <PrimaryButton className="text-xs py-2 px-4 shrink-0">
                🔒 Manage Secrets Vault →
              </PrimaryButton>
            </a>
          </div>
        </GlassPanel>

        <GlassPanel className="p-5">
          <SectionHeader eyebrow="Account" title="Profile & Workspace" />
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block text-[#B3B7C2] font-semibold">
                Display name
              </span>
              <input
                value={state.displayName}
                onChange={(e) => updateField("displayName", e.target.value)}
                className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-3.5 py-2 text-[#F5F5F7] focus:border-[#7A5AF8] focus:outline-none"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-[#B3B7C2] font-semibold">
                Email Address
              </span>
              <input
                type="email"
                value={state.email}
                onChange={(e) => updateField("email", e.target.value)}
                className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-3.5 py-2 text-[#F5F5F7] focus:border-[#7A5AF8] focus:outline-none"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-[#B3B7C2] font-semibold">
                Workspace
              </span>
              <input
                value={state.workspaceName}
                onChange={(e) => updateField("workspaceName", e.target.value)}
                className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-3.5 py-2 text-[#F5F5F7] focus:border-[#7A5AF8] focus:outline-none"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-[#B3B7C2] font-semibold">
                Timezone
              </span>
              <select
                value={state.timezone}
                onChange={(e) => updateField("timezone", e.target.value)}
                className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-3.5 py-2 text-[#F5F5F7] focus:border-[#7A5AF8] focus:outline-none"
              >
                <option>UTC-05:00</option>
                <option>UTC+00:00</option>
                <option>UTC+01:00</option>
                <option>UTC+05:30</option>
              </select>
            </label>
          </div>
        </GlassPanel>

        <GlassPanel className="p-5">
          <SectionHeader eyebrow="Visual" title="Appearance Settings" />
          <div className="grid gap-4 md:grid-cols-2">
            <fieldset className="rounded-xl border border-[#2A2E36] bg-[#16181D] p-4">
              <legend className="px-1 text-xs uppercase tracking-[0.16em] text-[#B3B7C2] font-semibold">
                Theme Preset
              </legend>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  className={`rounded-lg border px-4 py-2 text-xs uppercase tracking-[0.13em] cursor-pointer transition ${
                    theme === "dark"
                      ? "border-[#C7A66B]/60 bg-[#C7A66B]/15 text-[#E2C48D]"
                      : "border-[#2A2E36] bg-[#0F1115] text-[#B3B7C2] hover:border-[#B3B7C2]/30"
                  }`}
                >
                  Dark Panel
                </button>
                <button
                  type="button"
                  onClick={() => setTheme("night")}
                  className={`rounded-lg border px-4 py-2 text-xs uppercase tracking-[0.13em] cursor-pointer transition ${
                    theme === "night"
                      ? "border-[#C7A66B]/60 bg-[#C7A66B]/15 text-[#E2C48D]"
                      : "border-[#2A2E36] bg-[#0F1115] text-[#B3B7C2] hover:border-[#B3B7C2]/30"
                  }`}
                >
                  Pitch Night
                </button>
              </div>
            </fieldset>

            <fieldset className="rounded-xl border border-[#2A2E36] bg-[#16181D] p-4">
              <legend className="px-1 text-xs uppercase tracking-[0.16em] text-[#B3B7C2] font-semibold">
                System Accent
              </legend>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setAccent("gold")}
                  className={`rounded-lg border px-4 py-2 text-xs uppercase tracking-[0.13em] cursor-pointer transition ${
                    accent === "gold"
                      ? "border-[#C7A66B]/60 bg-[#C7A66B]/15 text-[#E2C48D]"
                      : "border-[#2A2E36] bg-[#0F1115] text-[#B3B7C2] hover:border-[#B3B7C2]/30"
                  }`}
                >
                  Golden Gold
                </button>
                <button
                  type="button"
                  onClick={() => setAccent("violet")}
                  className={`rounded-lg border px-4 py-2 text-xs uppercase tracking-[0.13em] cursor-pointer transition ${
                    accent === "violet"
                      ? "border-[#7A5AF8]/60 bg-[#7A5AF8]/15 text-[#CFC3FF]"
                      : "border-[#2A2E36] bg-[#0F1115] text-[#B3B7C2] hover:border-[#B3B7C2]/30"
                  }`}
                >
                  Futuristic Violet
                </button>
              </div>
            </fieldset>
          </div>
        </GlassPanel>

        <div className="grid gap-6 lg:grid-cols-2">
          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Alerts" title="Notifications" />
            <div className="space-y-3 text-sm">
              {[
                {
                  key: "digestEmail" as const,
                  label: "Daily digest activity report",
                },
                {
                  key: "pushAlerts" as const,
                  label: "Push alerts for runtime tasks",
                },
                {
                  key: "incidentOnly" as const,
                  label: "Only alert on failure incidents",
                },
              ].map((item) => {
                const value = state[item.key];
                return (
                  <label
                    key={item.key}
                    className="flex cursor-pointer items-center justify-between rounded-xl border border-[#2A2E36] bg-[#16181D] px-3.5 py-2.5 transition hover:bg-[#1E2128]"
                  >
                    <span className="text-[#F5F5F7]">{item.label}</span>
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={(e) => updateField(item.key, e.target.checked)}
                      className="h-4 w-4 accent-[#C7A66B] cursor-pointer"
                    />
                  </label>
                );
              })}
            </div>
          </GlassPanel>

          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Runtime" title="API Access & Target Region" />
            <div className="space-y-4">
              <label className="block text-sm">
                <span className="mb-1.5 block text-[#B3B7C2] font-semibold">
                  Sandbox API key
                </span>
                <input
                  value={state.apiKey}
                  onChange={(e) => updateField("apiKey", e.target.value)}
                  className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-3.5 py-2 text-[#E2C48D] focus:border-[#7A5AF8] focus:outline-none font-mono"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-[#B3B7C2] font-semibold">
                  Execution Region
                </span>
                <select
                  value={state.runtimeRegion}
                  onChange={(e) =>
                    updateField(
                      "runtimeRegion",
                      e.target.value as SettingsState["runtimeRegion"]
                    )
                  }
                  className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-3.5 py-2 text-[#F5F5F7] focus:border-[#7A5AF8] focus:outline-none"
                >
                  <option value="us-east-1">US East 1 (Sandboxed)</option>
                  <option value="eu-west-1">EU West 1 (Default)</option>
                </select>
              </label>
            </div>
          </GlassPanel>
        </div>
      </div>
    </AppShell>
  );
}
