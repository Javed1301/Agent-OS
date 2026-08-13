

### architecture.md — Agent Workspace

### System Architecture

Version: 1.0 Status: MVP / Implemented Foundation

### 1. Overview

Agent Workspace is a local-first, plugin-based AI orchestration platform.

The architecture is based on four principles:

* Discovery — Agents are registered through manifests.

* Isolation — Every execution is sandboxed.

* Streaming — Logs and results are emitted in real time.

* Extensibility — New runtimes can be added through adapters.

### 2. High-Level Architecture

`flowchart TD UI[Dashboard - Future] GW[Gateway API] EE[Execution Engine] PY[Python Adapter] REST[REST Adapter] STORE[Store & Logs] UI --> GW GW --> EE EE --> PY EE --> REST PY --> STORE REST --> STORE`

### 3. Repository Structure

`Agent-Workspace/ ├── apps/ │ └── gateway/ ├── agents/ │ ├── stock-analyst/ │ ├── hate-speech/ │ └── ... ├── data/ │ ├── executions/ │ └── logs/ ├── packages/ ├── workflows/ └── docs/`

### Responsibilities

| Path            | Responsibility                              |
| --------------- | ------------------------------------------- |
| apps/gateway    | HTTP API, registry, execution orchestration |
| agents/         | Manifest-only plugin definitions            |
| data/executions | Persistent execution state                  |
| data/logs       | Execution logs                              |
| packages/       | Shared libraries (future extraction)        |
| workflows/      | Workflow definitions (future)               |
| docs/           | Architecture and API documentation          |

### 4. Agent Discovery

### Manifest-Based Registration

Agents are registered through `agent.yaml`.

### Example

`id: stock-analyst name: Stock Analyst type: python entrypoint: main.py workingDirectory: D:/Javed/outskill/outskill/agents/advanced/v2 capabilities: - finance.stock-analysis healthcheck: type: subprocess requiredEnv: - OPENROUTER_API_KEY`

### Discovery Flow

`flowchart LR A[agents/*] --> B[agent.yaml] B --> C[Validate] C --> D[Registry]`

### 5. Registry Service

The registry maintains an in-memory catalog of all agents.

### Responsibilities

* Scan manifests

* Validate schema

* Resolve runtime metadata

* Expose lookup APIs

* Reload on startup

### Key APIs

`listAgents() getAgent(id) reload()`

### 6. Runtime Resolution

The platform automatically resolves Python environments.

### Resolution Order

`.venv311/Scripts/python.exe .venv/Scripts/python.exe venv/Scripts/python.exe python`

### Search Strategy

* Start from `workingDirectory`

* Walk upward until workspace root

* Use first matching interpreter

### 7. Execution Architecture

### Execution Lifecycle

`flowchart LR A[Request] --> B[Create ID] B --> C[Run Folder] C --> D[Execute] D --> E[Stream] E --> F[Persist] F --> G[Complete]`

### 8. Execution Isolation

Each run gets a dedicated sandbox.

`data/executions/<executionId>/ ├── input.json ├── output.json ├── logs.txt └── artifacts/`

### Why Isolation Matters

* No file collisions

* Easier debugging

* Artifact collection

* Reproducibility

* Safer concurrent execution

### 9. Streaming Model

Streaming uses Server-Sent Events (SSE).

### Event Types

| Event  | Purpose                                        |
| ------ | ---------------------------------------------- |
| status | started, running, completed, failed, cancelled |
| log    | stdout/stderr lines                            |
| result | final structured output                        |
| error  | execution errors                               |

### Example

`event: status data: {"state":"running"} event: log data: "Loading vector store..." event: result data: {"summary":"..."}`

### 10. Adapter Layer

The execution engine never talks directly to runtimes.

### Contract

`interface AgentAdapter { execute(input, context): Promise<ExecutionHandle> health(): Promise<HealthResult> cancel?(executionId: string): Promise<void> }`

### Implementations

### PythonSubprocessAdapter

* Spawns Python process

* Streams stdout/stderr

* Supports cancellation

* Resolves virtual env automatically

### RestAdapter

* Calls REST endpoint

* Polls for status

* Relays streamed output

* Health checks via HTTP

### 11. Execution Engine

### Responsibilities

* Create execution record

* Select adapter

* Start async execution

* Broadcast SSE events

* Persist state

* Handle completion/failure

* Handle cancellation

### Concurrency Control

A working-directory mutex prevents unsafe parallel runs for agents that share mutable resources.

### 12. Persistence Layer

### Execution Record

`{ "id": "exec_123", "agentId": "stock-analyst", "status": "completed", "startedAt": "...", "finishedAt": "...", "result": {} }`

### Storage Model

* JSON per execution

* Append-only logs

* Lightweight index file

* No database required for MVP

### 13. Logging Architecture

`flowchart LR A[stdout/stderr] --> B[SSE] B --> C[logs.txt]`

### Rotation

* 5 MB cap per log

* Truncate oldest content

* Keep execution metadata

### 14. Health System

### Subprocess Agents

Checks:

* Interpreter exists

* Entrypoint exists

* Required env vars exist

### REST Agents

Checks:

* HTTP reachable

* Status endpoint healthy

* Timeout handling

### 15. API Layer

### Core Endpoints

| Method | Endpoint                   |
| ------ | -------------------------- |
| GET    | /api/agents                |
| GET    | /api/agents/:id/health     |
| POST   | /api/agents/:id/execute    |
| GET    | /api/executions/:id        |
| GET    | /api/executions/:id/stream |
| POST   | /api/executions/:id/cancel |

### 16. Security Model (MVP)

### Local-First

* Binds to localhost by default

* No telemetry

* No external auth

### Secrets

Loaded from:

`apps/gateway/.env`

Not stored in execution records.

### 17. Failure Handling

### Failure States

* `failed`

* `cancelled`

* `timeout` (future)

### Recovery

* Persist partial logs

* Persist error message

* Keep execution folder for inspection

### 18. Workflow Architecture (Future)

`steps: - id: summarize agent: meeting-notes-api - id: podcast agent: podcaster-crew input: notes: ${summarize.output.summary}`

### Execution Graph

`flowchart LR A[Meeting] --> B[Summary] B --> C[Podcast]`

### 19. Scalability Considerations

### Current

* Single Node.js process

* Local filesystem

* Suitable for personal/team use

### Future

* Worker processes

* Queue backend

* Distributed runners

* Object storage

### 20. Design Decisions

| Decision               | Reason                              |
| ---------------------- | ----------------------------------- |
| Manifest-only agents   | Avoid breaking virtual environments |
| Filesystem persistence | Simple, transparent, debuggable     |
| SSE over WebSockets    | Simpler one-way streaming           |
| Adapter abstraction    | Runtime extensibility               |
| Per-execution folders  | Isolation and reproducibility       |

### 21. Current Implemented State

### Implemented

* YAML registry

* Python subprocess adapter

* REST adapter

* Execution engine

* SSE streaming

* Persistence

* Logging

* Cancellation

* Health checks

### 22. Final Architecture Statement

Agent Workspace uses a manifest-driven, adapter-based architecture where heterogeneous AI agents are discovered dynamically, executed in isolated sandboxes, streamed in real time, and persisted through a unified local orchestration gateway.
