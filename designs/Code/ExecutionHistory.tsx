/* User request: Create a separate code version of the existing Agent Dashboard project as React + TypeScript components using Tailwind CSS, with reusable shared components and five separately exported pages, preserving the existing premium dark futuristic visual system and interactions without redesign. */

import React from "react"
import {
    AppShell,
    GlassPanel,
    groupedHistory,
    SectionHeader,
    TimelineItem,
} from "../components/agent_dashboard"

export default function ExecutionHistory() {
    const [query, setQuery] = React.useState("")
    const [filter, setFilter] = React.useState<
        "all" | "success" | "warning" | "error" | "info"
    >("all")
    const handleQueryChange = React.useCallback((value: string) => {
        React.startTransition(() => {
            setQuery(value)
        })
    }, [])
    const handleFilterChange = React.useCallback(
        (value: "all" | "success" | "warning" | "error" | "info") => {
            React.startTransition(() => {
                setFilter(value)
            })
        },
        []
    )

    const filteredGroups = React.useMemo(() => {
        return groupedHistory
            .map((group) => ({
                ...group,
                items: group.items.filter((item) => {
                    const q = query.trim().toLowerCase()
                    const byQuery =
                        q.length === 0 ||
                        item.title.toLowerCase().includes(q) ||
                        item.detail.toLowerCase().includes(q)
                    const byFilter = filter === "all" || item.status === filter
                    return byQuery && byFilter
                }),
            }))
            .filter((group) => group.items.length > 0)
    }, [query, filter])

    return (
        <AppShell active="Execution History" title="Operations Log">
            <GlassPanel className="mb-6 p-5">
                <SectionHeader eyebrow="History" title="Operations Log" />
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <label className="block">
                        <span className="sr-only">Search execution logs</span>
                        <input
                            value={query}
                            onChange={(e) => handleQueryChange(e.target.value)}
                            placeholder="Search logs, tasks, or agent names..."
                            className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-3 py-2 text-sm text-[#F5F5F7] placeholder:text-[#6E7482] focus:border-[#7A5AF8] focus:outline-none"
                        />
                    </label>
                    <div
                        className="flex flex-wrap gap-2"
                        role="tablist"
                        aria-label="Log filters"
                    >
                        {(
                            [
                                "all",
                                "success",
                                "warning",
                                "error",
                                "info",
                            ] as const
                        ).map((value) => (
                            <button
                                key={value}
                                type="button"
                                role="tab"
                                aria-selected={filter === value}
                                onClick={() => handleFilterChange(value)}
                                className={`rounded-lg border px-3 py-2 text-xs uppercase tracking-[0.15em] transition ${
                                    filter === value
                                        ? "border-[#C7A66B]/60 bg-[#C7A66B]/15 text-[#E2C48D]"
                                        : "border-[#2A2E36] bg-[#16181D] text-[#B3B7C2] hover:text-[#F5F5F7]"
                                }`}
                            >
                                {value}
                            </button>
                        ))}
                    </div>
                </div>
            </GlassPanel>

            <div className="space-y-5">
                {filteredGroups.map((group) => (
                    <GlassPanel key={group.label} className="p-5">
                        <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-[#B3B7C2]">
                            {group.label}
                        </h3>
                        <ul className="space-y-2">
                            {group.items.map((item) => (
                                <TimelineItem key={item.id} item={item} />
                            ))}
                        </ul>
                    </GlassPanel>
                ))}
            </div>
        </AppShell>
    )
}
