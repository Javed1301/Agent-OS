# Architecture Evolution — Agent Workspace

This document tracks how and why the architecture of **Agent Workspace (Agent OS)** evolved over time, detailing the failures, trade-offs, and design shifts that led to the current production implementation.

---

## Architecture Evolution Overview Matrix

| Evolution Phase | Approximate Period | Architecture | Problem Discovered | Change Introduced | Primary Technical Rationale |
| --- | --- | --- | --- | --- | --- |
| **Evolution 0** | Aug 2026 | Prototype Script Runner | Monolithic code; no path abstraction. | Created `scripts/runner.py` dispatching modes. | Isolated execution scripts from server API. |
| **Evolution 1** | Aug 2026 | Manifest-Based Agents | Hardcoded agent definitions in TypeScript routes. | Introduced `agent.yaml` discovery in `agents/`. | Allowed plug-and-play agent addition without code changes. |
| **Evolution 2** | Aug 2026 | Single-Folder Express App | Monolithic repository layout hindered UI integration. | Refactored to npm monorepo (`apps/gateway`, `apps/dashboard`). | Separated UI control matrix from API gateway. |
| **Evolution 3** | Aug 2026 | Walkup `.venv` Resolution | Walkup interpreter search missed dependencies or failed on path drift. | Built Adapter Abstraction Layer (`AgentAdapter`). | Standardized execution across CPython subprocesses and REST endpoints. |
| **Evolution 4** | Aug 2026 | Shared Output Files | Concurrent executions clobbered output files. | Added per-execution folders (`data/executions/<id>/`) & Mutex (`usesWdLock`). | Guaranteed 100% execution isolation and reproducibility. |
| **Evolution 5** | Aug 2026 | Blocking HTTP Output | 30–60s agent execution caused UI timeouts. | Implemented Server-Sent Events (SSE) & log replay buffer. | Enabled real-time line-by-line log streaming over HTTP. |
| **Evolution 6** | Aug 2026 | Standalone Subprocess Kill | `process.kill()` left orphan Python child processes spinning. | Integrated process-tree killing (`tree-kill`). | Ensured clean termination across Windows and Linux process trees. |
| **Evolution 7** | Aug 2026 | Duplicated `.venv` Per Agent | 1.5–2.5 GB disk per agent; 2–5 min setup times. | Integrated Astral `uv` content-addressed runtime manager. | Reused virtualenvs via SHA-256 dependency hashing (80-90% disk savings). |
| **Evolution 8** | Aug 2026 | Plain Text `.env` Keys | Secret exposure risks in raw logs and records. | Built AES-256-GCM encrypted local vault & in-memory RAM injection. | Kept credentials private and offline. |
| **Evolution 9** | Aug 2026 | Custom Script Orchestration | Multi-agent chaining required writing custom Python code. | Built declarative YAML Workflow Engine with template interpolation. | Automated multi-agent pipelines (`workflows/*.yaml`). |
| **Evolution 10** | Aug 2026 | Host-Only Execution | Environment drift between Windows dev and Linux containers. | Added Docker Compose composition (`docker-compose.yml`). | Enabled one-command containerized deployment. |

---

## Detailed Architecture Changes

### Architecture Change: Manifest-Based Discovery vs Hardcoded Routes

#### Previous Architecture
Agents were hardcoded directly in Express route handlers and runner dispatch switches.

#### Problem Discovered
Adding a new agent required modifying core backend TypeScript files, rebuilding the gateway, and risking regressions.

#### Evidence
- Adding `myntra-rag` required modifying `src/routes/agents.ts` and `scripts/runner.py`.

#### Options Considered
1. **Hardcoded Routes**: Keep adding `if (agentId === 'myntra-rag')` in TypeScript.
2. **Database Registration**: Save agent specs in SQLite.
3. **Manifest-Based Discovery (`agent.yaml`)**: Put `agent.yaml` inside each agent's folder.

#### Decision
Adopt `agent.yaml` manifest discovery.

#### Why We Chose It
Zero backend code modifications required to register new agents. The gateway auto-discovers manifests at boot.

#### Trade-offs
Requires validating YAML schemas on boot.

#### Current Status
CURRENT / IMPLEMENTED (`apps/gateway/src/services/registry.service.ts`).

---

### Architecture Change: Content-Addressed `uv` Runtimes vs Local `.venv` Walkup

#### Previous Architecture
The gateway searched parent directories for `.venv311/Scripts/python.exe` or `venv/bin/python`.

#### Problem Discovered
- Duplicated packages: 5 CrewAI agents consumed 9.0 GB of disk space.
- Slow setup: `pip install` took 2–5 minutes per agent.
- Path drift: Moving folders broke interpreter paths.

#### Evidence
- Heavy disk consumption recorded in `docs/runtime-architecture.md` (30–50 GB for 20 agents).

#### Options Considered
1. **Global CPython**: Single host Python environment (high collision risk).
2. **Standalone `.venv` Per Agent**: Heavy disk duplication and slow installs.
3. **Content-Addressed `uv` Runtimes**: Hash dependency content with SHA-256, store runtimes in `runtimes/py311/<hash>/.venv`, and use `uv` package caching.

#### Decision
Implement content-addressed `uv` runtime management.

#### Why We Chose It
- Instant setup (<1s) for agents sharing identical dependency graphs.
- Up to 90% disk savings via SHA-256 runtime reuse and `uv` hardlinked package caching.

#### Trade-offs
Requires `uv` installed on the host or inside Docker containers.

#### Current Status
CURRENT / IMPLEMENTED (`apps/gateway/src/services/runtime.service.ts`).

---

### Architecture Change: Per-Execution Sandboxing & Mutex Locking

#### Previous Architecture
Agents executed in their working directory and wrote output files to shared root paths.

#### Problem Discovered
Concurrent agent runs overwrote each other's output files (e.g. `task_outputs/report.md`), corrupting output results.

#### Evidence
- Race conditions when running two `stock-analyst` executions simultaneously.

#### Options Considered
1. **Modify Agent Python Code**: Force all agents to accept custom output flags.
2. **Per-Execution Directories + Mutex Locking**: Create `data/executions/<id>/` for every run, and acquire a promise mutex (`usesWdLock`) for agents with fixed output paths.

#### Decision
Implement per-execution directory sandboxing with optional working-directory mutex locking.

#### Why We Chose It
Protects third-party and imported agent code without altering their Python scripts.

#### Trade-offs
Executions on the same locked working directory run sequentially.

#### Current Status
CURRENT / IMPLEMENTED (`apps/gateway/src/services/execution.service.ts`).

---

### Architecture Change: SSE Streaming vs Blocking HTTP

#### Previous Architecture
REST requests (`POST /execute`) blocked until the Python script completed.

#### Problem Discovered
Agents taking 30–60 seconds timed out web browsers and provided zero progress visibility.

#### Evidence
- User feedback in `project_details_qna.md` regarding spinning browser screens.

#### Options Considered
1. **Long Polling**: UI polls log endpoint every second.
2. **WebSockets**: Bi-directional socket connection.
3. **Server-Sent Events (SSE)**: Standard HTTP text stream.

#### Decision
Implement Server-Sent Events (SSE) with an in-memory event buffer.

#### Why We Chose It
Simpler than WebSockets, works over standard HTTP, and easily streams line-by-line logs directly to React terminals.

#### Current Status
CURRENT / IMPLEMENTED (`apps/gateway/src/services/execution.service.ts`).
