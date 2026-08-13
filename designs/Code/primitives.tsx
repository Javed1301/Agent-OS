/* User request: Create a separate code version of the existing Agent Dashboard project as React + TypeScript components using Tailwind CSS, with reusable shared components and five separately exported pages, preserving the existing premium dark futuristic visual system and interactions without redesign. */

import React from "react"
import { ActivityItem, Agent, AgentStatus, Metric } from "./types"

const statusStyles: Record<AgentStatus, string> = {
    Active: "text-[#E2C48D] border-[#C7A66B]/60 bg-[#C7A66B]/10",
    Idle: "text-[#B3B7C2] border-[#2A2E36] bg-[#16181D]",
    Deploying: "text-[#2DD4BF] border-[#2DD4BF]/40 bg-[#2DD4BF]/10",
    Paused: "text-[#B3B7C2] border-[#B3B7C2]/30 bg-[#16181D]",
    Error: "text-red-300 border-red-600/50 bg-red-900/20",
}

const activityStyles: Record<ActivityItem["status"], string> = {
    success: "bg-[#2DD4BF]",
    warning: "bg-[#C7A66B]",
    error: "bg-red-500",
    info: "bg-[#7A5AF8]",
}

export function GlassPanel({
    children,
    className = "",
}: React.PropsWithChildren<{ className?: string }>) {
    return (
        <section
            className={`relative rounded-2xl border border-[#C7A66B]/25 bg-[#0F1115]/90 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-sm ${className}`}
        >
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top_right,rgba(226,196,141,0.08),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(122,90,248,0.08),transparent_50%)]" />
            <div className="relative">{children}</div>
        </section>
    )
}

export function SectionHeader({
    eyebrow,
    title,
    action,
}: {
    eyebrow: string
    title: string
    action?: React.ReactNode
}) {
    return (
        <header className="mb-4 flex items-center justify-between gap-4">
            <div>
                <p className="mb-1 text-[11px] uppercase tracking-[0.22em] text-[#B3B7C2]">
                    {eyebrow}
                </p>
                <h2 className="text-lg font-semibold tracking-tight text-[#F5F5F7]">
                    {title}
                </h2>
            </div>
            {action}
        </header>
    )
}

export function PrimaryButton({
    children,
    className = "",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            {...props}
            type={props.type ?? "button"}
            className={`rounded-xl border border-[#E2C48D]/60 bg-[#C7A66B] px-4 py-2 text-sm font-semibold text-[#08090B] transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:bg-[#E2C48D] hover:shadow-[0_8px_30px_rgba(199,166,107,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E2C48D]/70 ${className}`}
        >
            {children}
        </button>
    )
}

export function SecondaryButton({
    children,
    className = "",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            {...props}
            type={props.type ?? "button"}
            className={`rounded-xl border border-[#2A2E36] bg-[#16181D] px-4 py-2 text-sm font-medium text-[#F5F5F7] transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-[#7A5AF8]/60 hover:bg-[#1E2128] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A5AF8]/60 ${className}`}
        >
            {children}
        </button>
    )
}

export function StatusBadge({ status }: { status: AgentStatus }) {
    return (
        <span
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide ${statusStyles[status]}`}
        >
            {status}
        </span>
    )
}

export function MetricCard({ metric }: { metric: Metric }) {
    const trendColor =
        metric.trend === "up"
            ? "text-[#2DD4BF]"
            : metric.trend === "down"
              ? "text-red-300"
              : "text-[#B3B7C2]"
    return (
        <GlassPanel className="p-4 transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-[#E2C48D]/35">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#B3B7C2]">
                {metric.label}
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-[#F5F5F7]">
                {metric.value}
            </p>
            <p className={`mt-1 text-xs ${trendColor}`}>{metric.delta}</p>
        </GlassPanel>
    )
}

export function AgentCard({ agent }: { agent: Agent }) {
    return (
        <GlassPanel className="p-4 transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-[#7A5AF8]/45">
            <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                    <h3 className="text-base font-semibold text-[#F5F5F7]">
                        {agent.name}
                    </h3>
                    <p className="text-xs uppercase tracking-[0.18em] text-[#B3B7C2]">
                        {agent.category}
                    </p>
                </div>
                <StatusBadge status={agent.status} />
            </div>
            <p className="mb-4 text-sm text-[#B3B7C2]">{agent.description}</p>
            <dl className="grid grid-cols-2 gap-2 text-xs">
                <div>
                    <dt className="text-[#B3B7C2]">Runtime</dt>
                    <dd className="text-[#F5F5F7]">{agent.runtime}</dd>
                </div>
                <div>
                    <dt className="text-[#B3B7C2]">Last Run</dt>
                    <dd className="text-[#F5F5F7]">{agent.lastRun}</dd>
                </div>
            </dl>
        </GlassPanel>
    )
}

export function TimelineItem({ item }: { item: ActivityItem }) {
    return (
        <li className="group flex items-start gap-3 rounded-xl border border-[#232731] bg-[#0F1115] p-3 transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:bg-[#16181D]">
            <span
                className={`mt-1 h-2.5 w-2.5 rounded-full ${activityStyles[item.status]}`}
                aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-[#F5F5F7]">
                        {item.title}
                    </p>
                    <time className="text-xs text-[#B3B7C2]">{item.time}</time>
                </div>
                <p className="mt-1 text-xs text-[#B3B7C2]">{item.detail}</p>
            </div>
        </li>
    )
}

export function TerminalPanel({ lines }: { lines: string[] }) {
    return (
        <GlassPanel className="h-full min-h-[260px] overflow-hidden">
            <div className="border-b border-[#2A2E36] px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-[#B3B7C2]">
                Live Runtime Terminal
            </div>
            <pre className="h-full overflow-auto p-4 text-xs leading-6 text-[#E2C48D]">
                {lines.map((line, index) => (
                    <div
                        key={`${line}-${index}`}
                        className="animate-pulse [animation-duration:2.6s]"
                    >
                        {line}
                    </div>
                ))}
            </pre>
        </GlassPanel>
    )
}

export function Sidebar({
    active,
    items,
    onSelect,
}: {
    active: string
    items: string[]
    onSelect: (label: string) => void
}) {
    return (
        <aside className="w-full max-w-[240px] border-r border-[#1C1F26] bg-[#0B0D11] p-4">
            <div className="mb-8">
                <p className="text-[11px] uppercase tracking-[0.25em] text-[#B3B7C2]">
                    Agent OS
                </p>
                <h1 className="text-xl font-semibold tracking-tight text-[#F5F5F7]">
                    Control Matrix
                </h1>
            </div>
            <nav
                aria-label="Primary dashboard navigation"
                className="space-y-2"
            >
                {items.map((item) => {
                    const isActive = item === active
                    return (
                        <button
                            key={item}
                            type="button"
                            onClick={() => onSelect(item)}
                            className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                                isActive
                                    ? "border-[#C7A66B]/45 bg-[#16181D] text-[#F5F5F7]"
                                    : "border-transparent text-[#B3B7C2] hover:border-[#2A2E36] hover:bg-[#16181D] hover:text-[#F5F5F7]"
                            }`}
                        >
                            {item}
                        </button>
                    )
                })}
            </nav>
        </aside>
    )
}

export function TopCommandBar({
    title,
    actions,
}: {
    title: string
    actions?: React.ReactNode
}) {
    return (
        <header className="sticky top-0 z-10 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#C7A66B]/25 bg-[#0F1115]/90 p-3 backdrop-blur">
            <h2 className="text-base font-semibold tracking-tight text-[#F5F5F7]">
                {title}
            </h2>
            <div className="flex items-center gap-2">{actions}</div>
        </header>
    )
}

export function AppShell({
    active,
    title,
    children,
    topActions,
}: React.PropsWithChildren<{
    active: string
    title: string
    topActions?: React.ReactNode
}>) {
    const [current, setCurrent] = React.useState(active)
    const handleSelect = React.useCallback((label: string) => {
        React.startTransition(() => {
            setCurrent(label)
        })
    }, [])

    return (
        <main className="relative min-h-screen bg-[#08090B] text-[#F5F5F7]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(226,196,141,0.12),transparent_35%),radial-gradient(circle_at_90%_10%,rgba(122,90,248,0.14),transparent_30%)]" />
            <div className="relative mx-auto flex w-full max-w-[1440px] flex-col lg:flex-row">
                <Sidebar
                    active={current}
                    items={[
                        "Home Dashboard",
                        "Agent Console",
                        "Execution History",
                        "Agent Registry",
                        "Settings",
                    ]}
                    onSelect={handleSelect}
                />
                <div className="w-full p-4 md:p-6">
                    <TopCommandBar title={title} actions={topActions} />
                    {children}
                </div>
            </div>
        </main>
    )
}
