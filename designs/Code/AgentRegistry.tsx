/* User request: Create a separate code version of the existing Agent Dashboard project as React + TypeScript components using Tailwind CSS, with reusable shared components and five separately exported pages, preserving the existing premium dark futuristic visual system and interactions without redesign. */

import React from "react"
import {
    agents,
    AgentCard,
    AppShell,
    developers,
    GlassPanel,
    PrimaryButton,
    SectionHeader,
    SecondaryButton,
    StatusBadge,
} from "../components/agent_dashboard"

type ViewMode = "grid" | "list"

const categories = ["All", "Support", "Sales", "Risk", "Marketing"] as const

export default function AgentRegistry() {
    const [query, setQuery] = React.useState("")
    const [selectedCategory, setSelectedCategory] =
        React.useState<(typeof categories)[number]>("All")
    const [viewMode, setViewMode] = React.useState<ViewMode>("grid")

    const handleQueryChange = React.useCallback((value: string) => {
        React.startTransition(() => {
            setQuery(value)
        })
    }, [])

    const handleCategorySelect = React.useCallback(
        (category: (typeof categories)[number]) => {
            React.startTransition(() => {
                setSelectedCategory(category)
            })
        },
        []
    )

    const handleViewMode = React.useCallback((mode: ViewMode) => {
        React.startTransition(() => {
            setViewMode(mode)
        })
    }, [])

    const filteredAgents = React.useMemo(() => {
        const normalized = query.trim().toLowerCase()
        return agents.filter((agent) => {
            const byCategory =
                selectedCategory === "All" ||
                agent.category === selectedCategory
            const byQuery =
                normalized.length === 0 ||
                agent.name.toLowerCase().includes(normalized) ||
                agent.description.toLowerCase().includes(normalized) ||
                agent.category.toLowerCase().includes(normalized)
            return byCategory && byQuery
        })
    }, [query, selectedCategory])

    return (
        <AppShell
            active="Agent Registry"
            title="Agent Registry"
            topActions={
                <>
                    <SecondaryButton aria-label="Sync registry">
                        Sync
                    </SecondaryButton>
                    <PrimaryButton aria-label="Add agent">
                        Add Agent
                    </PrimaryButton>
                </>
            }
        >
            <section className="grid gap-6 xl:grid-cols-[1.6fr_0.9fr]">
                <div className="space-y-4">
                    <GlassPanel className="p-5">
                        <SectionHeader
                            eyebrow="Registry"
                            title="Available Agents"
                        />
                        <div className="mb-3 grid gap-3 md:grid-cols-[1fr_auto]">
                            <label className="block">
                                <span className="sr-only">
                                    Search registry agents
                                </span>
                                <input
                                    value={query}
                                    onChange={(event) =>
                                        handleQueryChange(event.target.value)
                                    }
                                    placeholder="Search by name, category, or capability..."
                                    className="w-full rounded-xl border border-[#2A2E36] bg-[#0B0D11] px-3 py-2 text-sm text-[#F5F5F7] placeholder:text-[#6E7482] focus:border-[#7A5AF8] focus:outline-none"
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
                                    onClick={() => handleViewMode("grid")}
                                    className={`rounded-lg px-3 py-1.5 text-xs uppercase tracking-[0.14em] transition ${
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
                                    onClick={() => handleViewMode("list")}
                                    className={`rounded-lg px-3 py-1.5 text-xs uppercase tracking-[0.14em] transition ${
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
                                    onClick={() =>
                                        handleCategorySelect(category)
                                    }
                                    className={`rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.12em] transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                                        selectedCategory === category
                                            ? "border-[#C7A66B]/60 bg-[#C7A66B]/15 text-[#E2C48D]"
                                            : "border-[#2A2E36] bg-[#16181D] text-[#B3B7C2] hover:border-[#7A5AF8]/45 hover:text-[#F5F5F7]"
                                    }`}
                                >
                                    {category}
                                </button>
                            ))}
                        </div>

                        {viewMode === "grid" ? (
                            <div className="grid gap-4 md:grid-cols-2">
                                {filteredAgents.map((agent) => (
                                    <div
                                        key={agent.id}
                                        className="transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5"
                                    >
                                        <AgentCard agent={agent} />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <ul className="space-y-3">
                                {filteredAgents.map((agent) => (
                                    <li
                                        key={agent.id}
                                        className="rounded-xl border border-[#232731] bg-[#0F1115] p-4 transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[#16181D]"
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <h3 className="text-base font-semibold text-[#F5F5F7]">
                                                    {agent.name}
                                                </h3>
                                                <p className="text-xs uppercase tracking-[0.16em] text-[#B3B7C2]">
                                                    {agent.category}
                                                </p>
                                            </div>
                                            <StatusBadge
                                                status={agent.status}
                                            />
                                        </div>
                                        <p className="mt-2 text-sm text-[#B3B7C2]">
                                            {agent.description}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </GlassPanel>
                </div>

                <aside className="space-y-4">
                    <GlassPanel className="p-5">
                        <SectionHeader
                            eyebrow="Insights"
                            title="Registry Insights"
                        />
                        <dl className="space-y-3 text-sm">
                            <div className="flex items-center justify-between rounded-lg border border-[#2A2E36] bg-[#16181D] px-3 py-2">
                                <dt className="text-[#B3B7C2]">Published</dt>
                                <dd className="font-medium text-[#F5F5F7]">
                                    {agents.length}
                                </dd>
                            </div>
                            <div className="flex items-center justify-between rounded-lg border border-[#2A2E36] bg-[#16181D] px-3 py-2">
                                <dt className="text-[#B3B7C2]">
                                    Healthy Runtime
                                </dt>
                                <dd className="font-medium text-[#2DD4BF]">
                                    99.2%
                                </dd>
                            </div>
                            <div className="flex items-center justify-between rounded-lg border border-[#2A2E36] bg-[#16181D] px-3 py-2">
                                <dt className="text-[#B3B7C2]">
                                    Pending Reviews
                                </dt>
                                <dd className="font-medium text-[#E2C48D]">
                                    3
                                </dd>
                            </div>
                        </dl>
                    </GlassPanel>

                    <GlassPanel className="p-5">
                        <SectionHeader
                            eyebrow="Developers"
                            title="Preview List"
                        />
                        <ul className="space-y-2">
                            {developers.map((developer) => (
                                <li
                                    key={developer.id}
                                    className="rounded-lg border border-[#2A2E36] bg-[#16181D] px-3 py-2"
                                >
                                    <p className="text-sm font-medium text-[#F5F5F7]">
                                        {developer.name}
                                    </p>
                                    <p className="text-xs text-[#B3B7C2]">
                                        {developer.role} · {developer.focus}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </GlassPanel>
                </aside>
            </section>

            <div className="sticky bottom-4 z-20 mt-6 flex justify-end">
                <PrimaryButton
                    className="rounded-full px-5 py-3 shadow-[0_18px_45px_rgba(199,166,107,0.28)]"
                    aria-label="Add a new registry agent"
                >
                    + Add agent
                </PrimaryButton>
            </div>
        </AppShell>
    )
}
