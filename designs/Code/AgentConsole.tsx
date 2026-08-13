/* User request: Create a separate code version of the existing Agent Dashboard project as React + TypeScript components using Tailwind CSS, with reusable shared components and five separately exported pages, preserving the existing premium dark futuristic visual system and interactions without redesign. */

import React from "react"
import {
    AppShell,
    GlassPanel,
    groupedHistory,
    PrimaryButton,
    SectionHeader,
    SecondaryButton,
    TerminalPanel,
    TimelineItem,
} from "../components/agent_dashboard"

export default function AgentConsole() {
    const [temperature, setTemperature] = React.useState(0.7)
    const [expanded, setExpanded] = React.useState<string>("Today")
    const handleTemperature = React.useCallback((value: number) => {
        React.startTransition(() => {
            setTemperature(value)
        })
    }, [])
    const handleExpanded = React.useCallback((label: string) => {
        React.startTransition(() => {
            setExpanded((prev) => (prev === label ? "" : label))
        })
    }, [])

    const terminalLines = React.useMemo(
        () => [
            "[09:52:14] Booting runtime env: atlas-synth-prod",
            "[09:52:15] Loading prompt graph nodes: 18",
            "[09:52:15] Tool auth refreshed (vault scope: support)",
            "[09:52:16] Health check passed. Listening for job queue...",
            "[09:52:19] Job #2331 accepted -> sentiment-escalation",
        ],
        []
    )

    return (
        <AppShell
            active="Agent Console"
            title="Agent Console"
            topActions={
                <>
                    <SecondaryButton>Pause</SecondaryButton>
                    <PrimaryButton>Run Test</PrimaryButton>
                </>
            }
        >
            <GlassPanel className="mb-6 p-5">
                <SectionHeader
                    eyebrow="Agent Detail"
                    title="Atlas Synth / Support Orchestrator"
                />
                <div className="grid gap-4 lg:grid-cols-2">
                    <form className="space-y-4">
                        <label className="block text-sm">
                            <span className="mb-1 block text-[#B3B7C2]">
                                System Prompt
                            </span>
                            <textarea
                                className="min-h-[120px] w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] p-3 text-[#F5F5F7] focus:border-[#7A5AF8] focus:outline-none"
                                defaultValue="You are Atlas Synth. Prioritize user safety and concise escalations."
                            />
                        </label>
                        <label className="block text-sm">
                            <span className="mb-1 block text-[#B3B7C2]">
                                Temperature: {temperature.toFixed(1)}
                            </span>
                            <input
                                aria-label="Temperature"
                                type="range"
                                min={0}
                                max={1}
                                step={0.1}
                                value={temperature}
                                onChange={(e) =>
                                    handleTemperature(Number(e.target.value))
                                }
                                className="w-full accent-[#C7A66B]"
                            />
                        </label>
                    </form>
                    <TerminalPanel lines={terminalLines} />
                </div>
            </GlassPanel>

            <GlassPanel className="p-5">
                <SectionHeader
                    eyebrow="Execution History"
                    title="Recent Runtime Events"
                />
                <div className="space-y-4">
                    {groupedHistory.map((group) => {
                        const isOpen = expanded === group.label
                        return (
                            <section key={group.label}>
                                <button
                                    type="button"
                                    className="mb-2 flex w-full items-center justify-between rounded-lg border border-[#2A2E36] bg-[#16181D] px-3 py-2 text-left"
                                    onClick={() => handleExpanded(group.label)}
                                    aria-expanded={isOpen}
                                >
                                    <span className="text-sm font-medium text-[#F5F5F7]">
                                        {group.label}
                                    </span>
                                    <span className="text-[#B3B7C2]">
                                        {isOpen ? "−" : "+"}
                                    </span>
                                </button>
                                {isOpen && (
                                    <ul className="space-y-2">
                                        {group.items.map((item) => (
                                            <TimelineItem
                                                key={item.id}
                                                item={item}
                                            />
                                        ))}
                                    </ul>
                                )}
                            </section>
                        )
                    })}
                </div>
            </GlassPanel>
        </AppShell>
    )
}
