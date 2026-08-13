"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccentStyles, useTheme } from "./ThemeContext";
import { AgentDefinition, AgentStatus, Metric, ActivityItem } from "../types";

const statusStyles: Record<AgentStatus, string> = {
  available: "text-[#2DD4BF] border-[#2DD4BF]/40 bg-[#2DD4BF]/10",
  warning: "text-[#E2C48D] border-[#C7A66B]/50 bg-[#C7A66B]/15",
  unavailable: "text-red-300 border-red-600/50 bg-red-900/20",
  unknown: "text-[#B3B7C2] border-[#B3B7C2]/30 bg-[#16181D]",
};

const activityStyles: Record<ActivityItem["status"] | string, string> = {
  success: "bg-[#2DD4BF]",
  warning: "bg-[#C7A66B]",
  error: "bg-red-500",
  info: "bg-[#7A5AF8]",
};

export function GlassPanel({
  children,
  className = "",
}: React.PropsWithChildren<{ className?: string }>) {
  const { isViolet } = useTheme();
  return (
    <section
      className={`relative rounded-2xl border bg-[#0F1115]/90 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-sm transition-all duration-300 ${
        isViolet ? "border-[#7A5AF8]/25" : "border-[#C7A66B]/25"
      } ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          background: isViolet
            ? "radial-gradient(circle at top right, rgba(122,90,248,0.08), transparent 45%), radial-gradient(circle at bottom left, rgba(122,90,248,0.08), transparent 50%)"
            : "radial-gradient(circle at top right, rgba(226,196,141,0.08), transparent 45%), radial-gradient(circle at bottom left, rgba(122,90,248,0.08), transparent 50%)",
        }}
      />
      <div className="relative z-10 h-full w-full flex flex-col flex-1 min-h-0">{children}</div>
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
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
  );
}

export function PrimaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const accent = useAccentStyles();
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      className={`rounded-xl border px-4 py-2 text-sm font-semibold text-[#08090B] transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${accent.border} ${accent.bg} ${accent.bgHover} ${accent.shadow} ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { isViolet } = useTheme();
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      className={`rounded-xl border border-[#2A2E36] bg-[#16181D] px-4 py-2 text-sm font-medium text-[#F5F5F7] transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        isViolet
          ? "hover:border-[#7A5AF8]/60 focus-visible:ring-[#7A5AF8]/60"
          : "hover:border-[#C7A66B]/60 focus-visible:ring-[#C7A66B]/60"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function StatusBadge({ status }: { status: AgentStatus }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide ${statusStyles[status] || statusStyles.unknown}`}
    >
      {status}
    </span>
  );
}

export function MetricCard({ metric }: { metric: Metric }) {
  const { isViolet } = useTheme();
  const trendColor =
    metric.trend === "up"
      ? "text-[#2DD4BF]"
      : metric.trend === "down"
      ? "text-red-300"
      : "text-[#B3B7C2]";
  return (
    <GlassPanel className={`p-4 transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 min-w-0 ${
      isViolet ? "hover:border-[#7A5AF8]/35" : "hover:border-[#E2C48D]/35"
    }`}>
      <p className="text-[11px] uppercase tracking-[0.2em] text-[#B3B7C2]">
        {metric.label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-[#F5F5F7]">
        {metric.value}
      </p>
      <p className={`mt-1 text-xs ${trendColor}`}>{metric.delta}</p>
    </GlassPanel>
  );
}

export function TimelineItem({ item }: { item: ActivityItem }) {
  return (
    <li className="group flex items-start gap-3 rounded-xl border border-[#232731] bg-[#0F1115] p-3 transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:bg-[#16181D]">
      <span
        className={`mt-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0 ${activityStyles[item.status] || "bg-gray-400"}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-[#F5F5F7]">
            {item.title}
          </p>
          <time className="text-xs text-[#B3B7C2] flex-shrink-0">{item.time}</time>
        </div>
        <p className="mt-1 text-xs text-[#B3B7C2] line-clamp-2">{item.detail}</p>
      </div>
    </li>
  );
}

export function Sidebar({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const { isViolet } = useTheme();

  const items = [
    { label: "🚀 Launchpad", href: "/launchpad" },
    { label: "Home Dashboard", href: "/" },
    { label: "Agent Registry", href: "/agents" },
    { label: "Workflow Catalog", href: "/workflows" },
    { label: "Execution History", href: "/executions" },
    { label: "⚙️ Runtime Manager", href: "/settings/runtimes" },
    { label: "Settings", href: "/settings" },
  ];

  const checkActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside className={`w-full lg:w-[260px] lg:min-w-[260px] border-b lg:border-b-0 lg:border-r border-[#1C1F26] bg-[#0B0D11] p-6 flex flex-col justify-between shrink-0 ${className}`}>
      <div>
        <div className="mb-8">
          <p className="text-[11px] uppercase tracking-[0.25em] text-[#B3B7C2]">
            Agent OS
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-[#F5F5F7]">
            Control Matrix
          </h1>
        </div>
        <nav aria-label="Primary dashboard navigation" className="space-y-2">
          {items.map((item) => {
            const isActive = checkActive(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`block w-full rounded-xl border px-4 py-2.5 text-left text-sm transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isActive
                    ? isViolet
                      ? "border-[#7A5AF8]/45 bg-[#16181D] text-[#F5F5F7]"
                      : "border-[#C7A66B]/45 bg-[#16181D] text-[#F5F5F7]"
                    : "border-transparent text-[#B3B7C2] hover:border-[#2A2E36] hover:bg-[#16181D] hover:text-[#F5F5F7]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="mt-8 lg:mt-0 text-[10px] text-[#6E7482] tracking-wider uppercase">
        System Node v2.0.0
      </div>
    </aside>
  );
}

export function TopCommandBar({
  title,
  actions,
}: {
  title: string;
  actions?: React.ReactNode;
}) {
  const { isViolet } = useTheme();
  return (
    <header
      className={`sticky top-0 z-20 mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border bg-[#0F1115]/90 p-4 backdrop-blur transition-all duration-300 ${
        isViolet ? "border-[#7A5AF8]/25" : "border-[#C7A66B]/25"
      }`}
    >
      <h2 className="text-base font-semibold tracking-tight text-[#F5F5F7] min-w-0 truncate">
        {title}
      </h2>
      <div className="flex flex-wrap items-center gap-2 min-w-0 shrink-0">{actions}</div>
    </header>
  );
}

export function AppShell({
  title,
  children,
  topActions,
}: React.PropsWithChildren<{
  title: string;
  topActions?: React.ReactNode;
}>) {
  const { isViolet } = useTheme();
  return (
    <div className="relative flex flex-col lg:flex-row h-screen overflow-hidden bg-[#08090B] text-[#F5F5F7] overflow-x-hidden">
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_18%_0%,rgba(226,196,141,0.12),transparent_35%),radial-gradient(circle_at_90%_10%,rgba(122,90,248,0.14),transparent_30%)]"
        style={{
          background: isViolet
            ? "radial-gradient(circle at 18% 0%, rgba(122,90,248,0.12), transparent 35%), radial-gradient(circle at 90% 10%, rgba(122,90,248,0.14), transparent 30%)"
            : undefined,
        }}
      />
      <Sidebar className="shrink-0" />
      <main className="relative z-10 flex-1 min-w-0 overflow-y-auto overflow-x-hidden py-4 md:py-6 lg:py-8">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <TopCommandBar title={title} actions={topActions} />
          <div className="relative">{children}</div>
        </div>
      </main>
    </div>
  );
}
