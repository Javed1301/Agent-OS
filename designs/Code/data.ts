/* User request: Create a separate code version of the existing Agent Dashboard project as React + TypeScript components using Tailwind CSS, with reusable shared components and five separately exported pages, preserving the existing premium dark futuristic visual system and interactions without redesign. */

import {
    ActivityItem,
    Agent,
    DeveloperPreview,
    Metric,
    TimelineGroup,
} from "./types"

export const sidebarItems = [
    "Home Dashboard",
    "Agent Console",
    "Execution History",
    "Agent Registry",
    "Settings",
]

export const metrics: Metric[] = [
    {
        id: "m1",
        label: "Active Agents",
        value: "12",
        delta: "+18%",
        trend: "up",
    },
    {
        id: "m2",
        label: "Tasks Completed",
        value: "3,482",
        delta: "+9%",
        trend: "up",
    },
    {
        id: "m3",
        label: "Runtime Health",
        value: "99.2%",
        delta: "Stable",
        trend: "neutral",
    },
    {
        id: "m4",
        label: "Cost Efficiency",
        value: "87%",
        delta: "-2%",
        trend: "down",
    },
]

export const agents: Agent[] = [
    {
        id: "a1",
        name: "Atlas Synth",
        description: "Autonomous orchestration for support escalations.",
        category: "Support",
        status: "Active",
        runtime: "2h 41m",
        lastRun: "2 min ago",
        tasksCompleted: 421,
    },
    {
        id: "a2",
        name: "Nova Scout",
        description: "Lead qualification and enrichment pipeline.",
        category: "Sales",
        status: "Deploying",
        runtime: "0h 12m",
        lastRun: "Now",
        tasksCompleted: 17,
    },
    {
        id: "a3",
        name: "Vector Guard",
        description: "Compliance checks for outgoing communications.",
        category: "Risk",
        status: "Idle",
        runtime: "5h 03m",
        lastRun: "14 min ago",
        tasksCompleted: 953,
    },
    {
        id: "a4",
        name: "Echo Relay",
        description: "Multi-channel campaign dispatch and retry logic.",
        category: "Marketing",
        status: "Paused",
        runtime: "1h 16m",
        lastRun: "1 h ago",
        tasksCompleted: 228,
    },
]

export const recentActivity: ActivityItem[] = [
    {
        id: "r1",
        title: "Atlas Synth completed escalation batch",
        detail: "Processed 42 tickets with 97% confidence score.",
        time: "09:41",
        status: "success",
    },
    {
        id: "r2",
        title: "Nova Scout deployment in progress",
        detail: "Compiling prompt graph and tool manifests.",
        time: "09:25",
        status: "warning",
    },
    {
        id: "r3",
        title: "Vector Guard policy patch applied",
        detail: "Runtime sandbox updated to v4.1.7.",
        time: "08:57",
        status: "info",
    },
]

export const groupedHistory: TimelineGroup[] = [
    { label: "Today", items: recentActivity },
    {
        label: "Yesterday",
        items: [
            {
                id: "y1",
                title: "Echo Relay paused after threshold alert",
                detail: "Retry loop exceeded maximum attempts.",
                time: "22:14",
                status: "error",
            },
            {
                id: "y2",
                title: "Atlas Synth synchronized knowledge base",
                detail: "Indexed 1,284 new support documents.",
                time: "18:07",
                status: "success",
            },
        ],
    },
]

export const developers: DeveloperPreview[] = [
    {
        id: "d1",
        name: "Mila Chen",
        role: "Agent Architect",
        focus: "Toolchain",
    },
    { id: "d2", name: "Noah Patel", role: "Runtime Engineer", focus: "Safety" },
    { id: "d3", name: "Ari Gomez", role: "Prompt Ops", focus: "Evaluation" },
]
