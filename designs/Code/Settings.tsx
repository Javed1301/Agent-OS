/* User request: Create a separate code version of the existing Agent Dashboard project as React + TypeScript components using Tailwind CSS, with reusable shared components and five separately exported pages, preserving the existing premium dark futuristic visual system and interactions without redesign. */

import React from "react"
import {
    AppShell,
    GlassPanel,
    PrimaryButton,
    SectionHeader,
    SecondaryButton,
} from "../components/agent_dashboard"

interface SettingsState {
    displayName: string
    email: string
    workspaceName: string
    timezone: string
    theme: "dark" | "night"
    accent: "gold" | "violet"
    digestEmail: boolean
    pushAlerts: boolean
    incidentOnly: boolean
    apiKey: string
    runtimeRegion: "us-east-1" | "eu-west-1"
}

export default function Settings() {
    const [state, setState] = React.useState<SettingsState>({
        displayName: "Operator One",
        email: "operator@agentos.ai",
        workspaceName: "My Agent Workspace",
        timezone: "UTC-05:00",
        theme: "dark",
        accent: "gold",
        digestEmail: true,
        pushAlerts: true,
        incidentOnly: false,
        apiKey: "agnt_live_x7F2P9Q8",
        runtimeRegion: "us-east-1",
    })

    const updateField = React.useCallback(
        <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
            React.startTransition(() => {
                setState((prev) => ({ ...prev, [key]: value }))
            })
        },
        []
    )
    const toggleBooleanField = React.useCallback(
        (
            key: "digestEmail" | "pushAlerts" | "incidentOnly",
            value: boolean
        ) => {
            React.startTransition(() => {
                setState((prev) => ({ ...prev, [key]: value }))
            })
        },
        []
    )

    return (
        <AppShell
            active="Settings"
            title="Settings"
            topActions={
                <>
                    <SecondaryButton aria-label="Discard changes">
                        Cancel
                    </SecondaryButton>
                    <PrimaryButton aria-label="Save settings">
                        Save Changes
                    </PrimaryButton>
                </>
            }
        >
            <div className="space-y-6">
                <GlassPanel className="p-5">
                    <SectionHeader
                        eyebrow="Account"
                        title="Profile & Workspace"
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                        <label className="text-sm">
                            <span className="mb-1 block text-[#B3B7C2]">
                                Display name
                            </span>
                            <input
                                value={state.displayName}
                                onChange={(event) =>
                                    updateField(
                                        "displayName",
                                        event.target.value
                                    )
                                }
                                className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-3 py-2 text-[#F5F5F7] focus:border-[#7A5AF8] focus:outline-none"
                            />
                        </label>
                        <label className="text-sm">
                            <span className="mb-1 block text-[#B3B7C2]">
                                Email
                            </span>
                            <input
                                type="email"
                                value={state.email}
                                onChange={(event) =>
                                    updateField("email", event.target.value)
                                }
                                className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-3 py-2 text-[#F5F5F7] focus:border-[#7A5AF8] focus:outline-none"
                            />
                        </label>
                        <label className="text-sm">
                            <span className="mb-1 block text-[#B3B7C2]">
                                Workspace
                            </span>
                            <input
                                value={state.workspaceName}
                                onChange={(event) =>
                                    updateField(
                                        "workspaceName",
                                        event.target.value
                                    )
                                }
                                className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-3 py-2 text-[#F5F5F7] focus:border-[#7A5AF8] focus:outline-none"
                            />
                        </label>
                        <label className="text-sm">
                            <span className="mb-1 block text-[#B3B7C2]">
                                Timezone
                            </span>
                            <select
                                value={state.timezone}
                                onChange={(event) =>
                                    updateField("timezone", event.target.value)
                                }
                                className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-3 py-2 text-[#F5F5F7] focus:border-[#7A5AF8] focus:outline-none"
                            >
                                <option>UTC-05:00</option>
                                <option>UTC+00:00</option>
                                <option>UTC+01:00</option>
                            </select>
                        </label>
                    </div>
                </GlassPanel>

                <GlassPanel className="p-5">
                    <SectionHeader eyebrow="Visual" title="Appearance" />
                    <div className="grid gap-4 md:grid-cols-2">
                        <fieldset className="rounded-xl border border-[#2A2E36] bg-[#16181D] p-3">
                            <legend className="px-1 text-xs uppercase tracking-[0.16em] text-[#B3B7C2]">
                                Theme
                            </legend>
                            <div className="mt-2 flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => updateField("theme", "dark")}
                                    className={`rounded-lg border px-3 py-2 text-xs uppercase tracking-[0.13em] ${
                                        state.theme === "dark"
                                            ? "border-[#C7A66B]/60 bg-[#C7A66B]/15 text-[#E2C48D]"
                                            : "border-[#2A2E36] bg-[#0F1115] text-[#B3B7C2]"
                                    }`}
                                >
                                    Dark
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        updateField("theme", "night")
                                    }
                                    className={`rounded-lg border px-3 py-2 text-xs uppercase tracking-[0.13em] ${
                                        state.theme === "night"
                                            ? "border-[#C7A66B]/60 bg-[#C7A66B]/15 text-[#E2C48D]"
                                            : "border-[#2A2E36] bg-[#0F1115] text-[#B3B7C2]"
                                    }`}
                                >
                                    Night
                                </button>
                            </div>
                        </fieldset>
                        <fieldset className="rounded-xl border border-[#2A2E36] bg-[#16181D] p-3">
                            <legend className="px-1 text-xs uppercase tracking-[0.16em] text-[#B3B7C2]">
                                Accent
                            </legend>
                            <div className="mt-2 flex gap-2">
                                <button
                                    type="button"
                                    onClick={() =>
                                        updateField("accent", "gold")
                                    }
                                    className={`rounded-lg border px-3 py-2 text-xs uppercase tracking-[0.13em] ${
                                        state.accent === "gold"
                                            ? "border-[#C7A66B]/60 bg-[#C7A66B]/15 text-[#E2C48D]"
                                            : "border-[#2A2E36] bg-[#0F1115] text-[#B3B7C2]"
                                    }`}
                                >
                                    Gold
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        updateField("accent", "violet")
                                    }
                                    className={`rounded-lg border px-3 py-2 text-xs uppercase tracking-[0.13em] ${
                                        state.accent === "violet"
                                            ? "border-[#7A5AF8]/60 bg-[#7A5AF8]/15 text-[#CFC3FF]"
                                            : "border-[#2A2E36] bg-[#0F1115] text-[#B3B7C2]"
                                    }`}
                                >
                                    Violet
                                </button>
                            </div>
                        </fieldset>
                    </div>
                </GlassPanel>

                <div className="grid gap-6 lg:grid-cols-2">
                    <GlassPanel className="p-5">
                        <SectionHeader eyebrow="Alerts" title="Notifications" />
                        <div className="space-y-3 text-sm">
                            {(
                                [
                                    {
                                        key: "digestEmail",
                                        label: "Daily digest email",
                                    },
                                    {
                                        key: "pushAlerts",
                                        label: "Push alerts for agent events",
                                    },
                                    {
                                        key: "incidentOnly",
                                        label: "Only notify me on incidents",
                                    },
                                ] as const
                            ).map((item) => {
                                const value = state[item.key]
                                return (
                                    <label
                                        key={item.key}
                                        className="flex cursor-pointer items-center justify-between rounded-xl border border-[#2A2E36] bg-[#16181D] px-3 py-2"
                                    >
                                        <span className="text-[#F5F5F7]">
                                            {item.label}
                                        </span>
                                        <input
                                            type="checkbox"
                                            checked={value}
                                            onChange={(event) =>
                                                toggleBooleanField(
                                                    item.key,
                                                    event.target.checked
                                                )
                                            }
                                            className="h-4 w-4 accent-[#C7A66B]"
                                        />
                                    </label>
                                )
                            })}
                        </div>
                    </GlassPanel>

                    <GlassPanel className="p-5">
                        <SectionHeader
                            eyebrow="Runtime"
                            title="API Access & Region"
                        />
                        <div className="space-y-4">
                            <label className="text-sm">
                                <span className="mb-1 block text-[#B3B7C2]">
                                    API key
                                </span>
                                <input
                                    value={state.apiKey}
                                    onChange={(event) =>
                                        updateField(
                                            "apiKey",
                                            event.target.value
                                        )
                                    }
                                    className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-3 py-2 text-[#E2C48D] focus:border-[#7A5AF8] focus:outline-none"
                                />
                            </label>
                            <label className="text-sm">
                                <span className="mb-1 block text-[#B3B7C2]">
                                    Runtime region
                                </span>
                                <select
                                    value={state.runtimeRegion}
                                    onChange={(event) =>
                                        updateField(
                                            "runtimeRegion",
                                            event.target
                                                .value as SettingsState["runtimeRegion"]
                                        )
                                    }
                                    className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-3 py-2 text-[#F5F5F7] focus:border-[#7A5AF8] focus:outline-none"
                                >
                                    <option value="us-east-1">US East 1</option>
                                    <option value="eu-west-1">EU West 1</option>
                                </select>
                            </label>
                        </div>
                    </GlassPanel>
                </div>
            </div>
        </AppShell>
    )
}
