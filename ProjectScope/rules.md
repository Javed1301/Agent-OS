Here is a VS Code–friendly `RULES.md` for your Agent Workspace project. It is written as a practical engineering rules document for you, Antigravity, Codex, Gemini, and any future contributors.

Save it as `docs/RULES.md` or `RULES.md` in the repo root.

### RULES.md — Agent Workspace Engineering Rules

### Version

Version: 1.0 Status: Active

### 1. Purpose

This document defines the mandatory engineering rules for the Agent Workspace project.

These rules exist to ensure:

* platform stability,

* reproducible executions,

* safe agent integration,

* consistent architecture,

* future product scalability.

All contributors, AI coding agents, and automation tools must follow these rules.

### 2. Core Principles

### 2.1 Local-First

* The platform is local by default.

* No telemetry or analytics may be added without explicit approval.

* Secrets must remain on the local machine.

### 2.2 Plugin-Based

* Agents are registered through manifests.

* The gateway must not contain agent-specific logic.

* Adding an agent should not require backend code changes.

### 2.3 Isolation

* Every execution is isolated.

* Agents must not share execution folders.

* Temporary files must stay inside the execution sandbox.

### 2.4 Extensibility

* New runtimes are added through adapters.

* Existing adapters must not be modified for a specific agent.

### 3. Repository Rules

### 3.1 Allowed Top-Level Structure

`apps/ agents/ data/ packages/ workflows/ docs/`

No additional top-level folders may be introduced without approval.

### 3.2 Gateway Ownership

* Active gateway code lives in `apps/gateway`.

* Legacy root `src/`, `config/`, and `database/` folders must not be used.

### 3.3 Agent Ownership

* `agents/` contains manifests only.

* Actual agent source code remains in its original project directory.

### 4. Manifest Rules

### 4.1 Required Fields

Every `agent.yaml` must contain:

`id name type entrypoint workingDirectory capabilities healthcheck`

### 4.2 Stable IDs

* `id` is permanent.

* Never rename an existing agent ID.

### 4.3 Capability Naming

Use dot-separated namespaces.

### Correct

`finance.stock-analysis text.summarization audio.podcast-generation`

### Incorrect

`stock summarize podcast`

### 4.4 No Secrets in Manifests

Forbidden:

`apiKey: xxx token: xxx password: xxx`

### 5. Runtime Rules

### 5.1 Do Not Store Interpreter Paths

Forbidden:

`interpreterPath: C:/.../python.exe`

The gateway resolves interpreters automatically.

### 5.2 Supported Runtime Types

* `python`

* `rest`

Future types require approval.

### 6. Execution Rules

### 6.1 Mandatory Isolation

Each execution must create:

`data/executions/<executionId>/ ├── input.json ├── output.json ├── logs.txt └── artifacts/`

### 6.2 No Shared Temporary Files

Agents must not write to:

* repo root,

* `data/logs`,

* other execution folders.

### 6.3 Artifact Rule

Any generated file larger than 1 KB must be placed in `artifacts/`.

### 7. Streaming Rules

### 7.1 SSE Is the Standard

Use Server-Sent Events for execution streaming.

Do not introduce WebSockets unless approved.

### 7.2 Event Types

Allowed events:

* `status`

* `log`

* `result`

* `error`

No custom event types without approval.

### 8. Adapter Rules

### 8.1 Adapter Contract

All adapters must implement:

`execute() health() cancel()`

### 8.2 No Agent-Specific Branches

Forbidden:

`if (agent.id === 'stock-analyst') { ... }`

Use manifest metadata instead.

### 9. Logging Rules

### 9.1 Append-Only During Execution

Logs may only be appended while running.

### 9.2 No Secret Logging

Never log:

* API keys

* tokens

* passwords

* full auth headers

### 10. Health Check Rules

### 10.1 Subprocess Agents

Must verify:

* interpreter exists,

* entrypoint exists,

* required env vars exist.

### 10.2 REST Agents

Must verify:

* endpoint reachable,

* health endpoint returns success.

### 11. Concurrency Rules

### 11.1 Working Directory Mutex

Agents sharing a mutable working directory must not run concurrently.

### 11.2 Read-Only Agents

Pure read-only RAG agents may be marked concurrent in the future.

### 12. Persistence Rules

### 12.1 Execution Records Are Immutable After Completion

Only status transitions are allowed while running.

### 12.2 Keep Failed Executions

Failed executions must not be deleted automatically.

### 13. Security Rules

### 13.1 Localhost Default

Gateway binds to:

`127.0.0.1`

### 13.2 Environment Variables

Secrets must be loaded from:

`apps/gateway/.env`

### 13.3 No Embedded Credentials

Forbidden in code, manifests, tests, and docs.

### 14. AI Coding Agent Rules

These apply to Antigravity, Codex, Gemini, Claude, Copilot, etc.

### 14.1 Do Not Rewrite Working Systems

Prefer minimal changes.

### 14.2 Do Not Move Existing Agent Source Trees

Virtual environments may break.

### 14.3 Do Not Introduce New Frameworks

Unless explicitly requested.

### 14.4 Output Format

For any change provide:

* files created,

* files modified,

* exact code changes,

* verification steps.

### 15. Testing Rules

### 15.1 Before Marking Complete

Verify:

* discovery,

* health,

* execute,

* stream,

* persist,

* cancel.

### 15.2 Manual Smoke Test

`GET /api/agents GET /api/agents/:id/health POST /api/agents/:id/execute GET /api/executions/:id/stream GET /api/executions/:id POST /api/executions/:id/cancel`

### 16. Documentation Rules

Every architectural change must update:

* `PRD.md`

* `architecture.md`

* `RULES.md`

### 17. Roadmap Protection

The following are not allowed in MVP:

* cloud sync,

* user accounts,

* billing,

* marketplace,

* distributed workers,

* GPU scheduling.

### 18. Definition of Done

A change is complete only if:

* it follows this document,

* builds successfully,

* passes smoke tests,

* does not break existing agents,

* updates relevant documentation.

### 19. Escalation Rule

If a contributor is unsure whether a change violates the architecture:

Stop and ask before implementing.

### 20. Final Rule

Prefer stability over cleverness.

Agent Workspace is a platform, not a demo. Any change that makes the system harder to reason about, debug, or reproduce should be rejected unless it provides clear long-term architectural value.
 