/* User request: Create a separate code version of the existing Agent Dashboard project as React + TypeScript components using Tailwind CSS, with reusable shared components and five separately exported pages, preserving the existing premium dark futuristic visual system and interactions without redesign. */

export type AgentStatus = "Active" | "Idle" | "Deploying" | "Paused" | "Error"

export interface Metric {
    id: string
    label: string
    value: string
    delta: string
    trend: "up" | "down" | "neutral"
}

export interface Agent {
    id: string
    name: string
    description: string
    category: string
    status: AgentStatus
    runtime: string
    lastRun: string
    tasksCompleted: number
}

export interface ActivityItem {
    id: string
    title: string
    detail: string
    time: string
    status: "success" | "warning" | "error" | "info"
}

export interface TimelineGroup {
    label: string
    items: ActivityItem[]
}

export interface DeveloperPreview {
    id: string
    name: string
    role: string
    focus: string
}
