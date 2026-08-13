Here is a VS Code–friendly `PHASES.md` that takes the project from today’s local working platform all the way to a fully functional, deployed, production-ready product.

### PHASES.md — Agent Workspace Roadmap

Version: 1.0 Status: Strategic Roadmap Horizon: MVP → Production → Commercial Product

### 0. Current Status (Completed)

### Goal

Establish the platform foundation.

### Implemented

* YAML-based agent discovery

* Python subprocess adapter

* REST adapter

* Execution engine

* SSE streaming

* Execution persistence

* Log persistence

* Cancellation

* Health checks

* Per-execution isolation

### Outcome

You already have a working local AI orchestration platform.

### Phase 1 — Stabilization (1–2 Days)

### Goal

Make the current platform reliable for daily development.

### Tasks

Remove legacy root folders (src, config, database)

Fix deprecated model references

Add missing environment variables

Verify all 6 agents execute successfully

Add smoke-test script

### Deliverables

* 6/6 healthy agents

* 6/6 successful executions

* Clean workspace

### Success Metric

100% local reliability

### Phase 2 — Developer Experience (2–4 Days)

### Goal

Make adding and debugging agents effortless.

### Tasks

Create agent init template

Add manifest validation CLI

Add hot-reload for agent.yaml

Add colored logs in terminal

Add execution search command

Add doctor command for env diagnostics

### Deliverables

`aw agent init aw doctor aw executions list aw logs <id>`

### Success Metric

New agent added in < 2 minutes

### Phase 3 — Workflow Engine (3–5 Days)

### Goal

Turn the platform from agent runner into agent orchestrator.

### Workflow Example

`steps: - id: summarize agent: meeting-notes-api - id: podcast agent: podcaster-crew input: notes: ${summarize.output.summary}`

### Features

Sequential steps

Parallel steps

Output mapping

Failure handling

Retry policy

Shared workflow context

### Architecture

`flowchart LR A[Agent A] --> B[Agent B] A --> C[Agent C] B --> D[Agent D] C --> D`

### Success Metric

Multi-agent automation without custom code

### Phase 4 — Dashboard MVP (4–7 Days)

### Goal

Provide a usable visual interface.

### Stack

* Next.js

* React

* Tailwind

* shadcn/ui

### Screens

Agent catalog

Execution runner

Live logs

Execution history

Health view

Workflow runner

### Live Log UI

`Running stock-analyst [10:21:03] Fetching market data... [10:21:05] Analyzing trends... [10:21:08] Generating report... ✔ Completed`

### Success Metric

Non-technical user can run an agent

### Phase 5 — Packaging & Distribution (3–5 Days)

### Goal

Make the platform portable.

### Tasks

Dockerize gateway

Dockerize sample agents

Add docker-compose.yml

Add volume mapping for data/

Add health checks

### Deliverables

`docker compose up`

### Success Metric

One-command startup on a new machine

### Phase 6 — Plugin SDK (5–7 Days)

### Goal

Allow third parties to build agents.

### SDKs

Python SDK

Node SDK

### Generator

`aw plugin create my-agent`

### Generated Structure

`my-agent/ ├── agent.yaml ├── main.py ├── requirements.txt └── README.md`

### Success Metric

External developer creates an agent in < 10 minutes

### Phase 7 — Advanced Runtime Features (1–2 Weeks)

### Goal

Support heavier and more reliable workloads.

### Features

Timeouts

Resource limits

Queueing

Priority execution

Worker pool

Retry strategies

Execution snapshots

### Architecture

`flowchart LR API[API] --> Q[Queue] Q --> W1[Worker 1] Q --> W2[Worker 2] Q --> W3[Worker 3]`

### Success Metric

Stable under 50+ concurrent executions

### Phase 8 — Authentication & Teams (1 Week)

### Goal

Enable shared usage.

### Features

API keys

JWT auth

User profiles

Team workspaces

Execution ownership

Audit logs

### Success Metric

Multiple users safely share one deployment

### Phase 9 — Cloud Deployment (3–5 Days)

### Goal

Deploy a production instance.

### Recommended Stack

### Backend

* Railway / Fly.io / Render

* PostgreSQL

* Object storage (S3/R2)

### Frontend

* Vercel

### Architecture

`flowchart TD V[Vercel] G[Gateway] DB[(Postgres)] S[(S3/R2)] W[Workers] V --> G G --> DB G --> S G --> W`

### Success Metric

Publicly accessible production deployment

### Phase 10 — Observability (3–5 Days)

### Goal

Operate the platform professionally.

### Features

Structured logs

Metrics

Tracing

Error aggregation

Uptime monitoring

Cost tracking

### Dashboard

* Executions/min

* Failure rate

* Avg duration

* Active workers

* Token usage

### Success Metric

Can diagnose production issues in < 5 minutes

### Phase 11 — Marketplace Foundation (1–2 Weeks)

### Goal

Turn agents into shareable products.

### Features

Capability search

Agent ratings

Versioning

Install from registry

Update notifications

Dependency checks

### Example

`aw install finance/stock-analyst@1.2.0`

### Success Metric

One-click agent installation

### Phase 12 — Commercial Product (2–4 Weeks)

### Goal

Become a deployable SaaS/product.

### Features

Billing

Usage quotas

Managed secrets

Team plans

Hosted workflows

Webhooks

Scheduled executions

### Positioning

“Docker + Zapier for AI agents”

### Recommended Timeline

| Phase    | Duration | Cumulative |
| -------- | -------- | ---------- |
| Current  | Done     | —          |
| Phase 1  | 2 days   | 2 days     |
| Phase 2  | 4 days   | 6 days     |
| Phase 3  | 5 days   | 11 days    |
| Phase 4  | 7 days   | 18 days    |
| Phase 5  | 5 days   | 23 days    |
| Phase 6  | 7 days   | 30 days    |
| Phase 7  | 14 days  | 44 days    |
| Phase 8  | 7 days   | 51 days    |
| Phase 9  | 5 days   | 56 days    |
| Phase 10 | 5 days   | 61 days    |
| Phase 11 | 14 days  | 75 days    |
| Phase 12 | 21 days  | 96 days    |

### What to Build Next (Strict Priority)

### Immediate

* Phase 1 — Stabilization

* Phase 3 — Workflow Engine

### Then

* Phase 4 — Dashboard MVP

### Then

* Phase 5 — Docker Packaging

Everything else can wait.

### Milestone View

### Milestone A — Stable Local Platform

* 6 healthy agents

* reliable execution

* logs + cancel

Target: 2 days

### Milestone B — Real Agentic System

* workflows

* chaining

* retries

Target: 11 days

### Milestone C — Usable Product

* dashboard

* workflow UI

* history

Target: 18 days

### Milestone D — Portable Product

* Docker

* one-command startup

Target: 23 days

### Milestone E — Deployable Product

* cloud deployment

* auth

* observability

Target: 61 days

### Milestone F — Commercial Platform

* marketplace

* billing

* teams

* scheduling

Target: 96 days

### Final End-State

`flowchart TD Users[Users] Web[Web Dashboard] API[Gateway API] WF[Workflow Engine] Queue[Execution Queue] Workers[Agent Workers] Store[(Postgres)] Obj[(Object Storage)] Market[Marketplace] Users --> Web Web --> API API --> WF WF --> Queue Queue --> Workers Workers --> Store Workers --> Obj API --> Market`

### Product Definition at Completion

Agent Workspace becomes a local-first and cloud-deployable AI orchestration platform where developers and teams can discover, install, run, monitor, compose, and share heterogeneous AI agents through a unified execution, workflow, and marketplace system.
