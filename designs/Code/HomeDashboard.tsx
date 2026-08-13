/* User request: Create a separate code version of the existing Agent Dashboard project as React + TypeScript components using Tailwind CSS, with reusable shared components and five separately exported pages, preserving the existing premium dark futuristic visual system and interactions without redesign. */

import React from "react"
import {
    agents,
    AppShell,
    GlassPanel,
    metrics,
    MetricCard,
    PrimaryButton,
    recentActivity,
    SectionHeader,
    SecondaryButton,
    TimelineItem,
} from "../components/agent_dashboard"

export default function HomeDashboard() {
    return (
        <AppShell
            active="Home Dashboard"
            title="My Agent Workspace"
            topActions={
                <>
                    <SecondaryButton aria-label="Open command palette">
                        Command
                    </SecondaryButton>
                    <PrimaryButton aria-label="Deploy agent">
                        Deploy Agent
                    </PrimaryButton>
                </>
            }
        >
            <section className="mb-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
                <GlassPanel className="p-6">
                    <SectionHeader
                        eyebrow="Control Panel"
                        title="My Agent Workspace"
                    />
                    <p className="max-w-xl text-sm text-[#B3B7C2]">
                        Coordinate autonomous workflows, monitor runtime
                        behavior, and ship improvements with guarded
                        deployments.
                    </p>
                    <div className="mt-8 flex items-center gap-4">
                        <div
                            aria-hidden="true"
                            className="h-24 w-24 rounded-full bg-[radial-gradient(circle_at_30%_30%,#E2C48D,rgba(199,166,107,0.2)_50%,rgba(122,90,248,0.18)_100%)] blur-[0.3px]"
                        />
                        <PrimaryButton>Deploy agent</PrimaryButton>
                    </div>
                </GlassPanel>
                <GlassPanel className="p-6">
                    <SectionHeader
                        eyebrow="Recent Activity"
                        title="Operational Feed"
                    />
                    <ul className="space-y-3">
                        {recentActivity.map((item) => (
                            <TimelineItem key={item.id} item={item} />
                        ))}
                    </ul>
                </GlassPanel>
            </section>

            <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {metrics.map((metric) => (
                    <MetricCard key={metric.id} metric={metric} />
                ))}
            </section>

            <section>
                <SectionHeader eyebrow="Agents" title="Active Agent Grid" />
                <div className="grid gap-4 md:grid-cols-2">
                    {agents.map((agent) => (
                        <div
                            key={agent.id}
                            className="animate-[fadeIn_400ms_cubic-bezier(0.22,1,0.36,1)]"
                        >
                            <GlassPanel className="p-4 transition duration-300 hover:-translate-y-0.5 hover:border-[#E2C48D]/40">
                                <h3 className="text-base font-semibold text-[#F5F5F7]">
                                    {agent.name}
                                </h3>
                                <p className="mt-1 text-sm text-[#B3B7C2]">
                                    {agent.description}
                                </p>
                                <div className="mt-3 text-xs text-[#B3B7C2]">
                                    Last run {agent.lastRun}
                                </div>
                            </GlassPanel>
                        </div>
                    ))}
                </div>
            </section>
        </AppShell>
    )
}
