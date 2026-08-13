# Agent Packaging Standard — `agent.yaml`

Every agent in the Agent Workspace is defined by a single `agent.yaml` file
inside `agents/<id>/`. The registry auto-discovers these files on startup.

---

## Minimal Example

```yaml
id: my-agent
name: My Agent
type: python
entrypoint: my-agent
workingDirectory: /absolute/path/to/my_agent_source

inputs:
  query:
    type: string
    required: true

healthcheck:
  type: subprocess
  requiredEnv:
    - MY_API_KEY
```

---

## Full Schema

```yaml
# ─── Required fields ─────────────────────────────────────────
id: <string>
# Unique identifier. Used in URLs: /api/agents/<id>
# Must match the directory name: agents/<id>/agent.yaml
# Use kebab-case.

name: <string>
# Human-readable display name.

type: python | node | cli | rest | websocket
# Runtime adapter to use.

entrypoint: <string>
# For python agents: the --mode value passed to runner.py.
# For rest agents: the base URL (e.g. http://localhost:8000).

workingDirectory: <string>
# Absolute path to the agent's source code directory.
# The subprocess runs with cwd = workingDirectory.
# The Python interpreter is auto-resolved from this directory.

# ─── Optional metadata ───────────────────────────────────────
version: "1.0.0"
description: "..."
category: "Content Moderation"
capabilities:
  - text-classification
  - moderation
icon: shield
phase: 1  # 1 = fully working, 2 = experimental/complex

# ─── Inputs schema ───────────────────────────────────────────
inputs:
  <field_name>:
    type: string | number | boolean
    required: true | false
    description: "..."
    default: <value>

# ─── Outputs schema (informational) ─────────────────────────
outputs:
  <field_name>:
    type: string | object

# ─── Health check ────────────────────────────────────────────
healthcheck:
  type: subprocess | http

  # For subprocess agents:
  requiredEnv:
    - API_KEY_1
    - API_KEY_2
  # The gateway checks these keys exist in:
  #   1. Agent's local .env (or any .env found walking up from workingDirectory)
  #   2. Gateway's own process.env (fallback)

  # For REST/HTTP agents:
  endpoint: http://localhost:8000/health
  # HTTP GET must return 200 with body: {"status": "healthy"}

# ─── Execution options ───────────────────────────────────────
usesWdLock: false
# Set to true if the agent writes to fixed-filename output files
# (e.g. task_outputs/report.md). This prevents concurrent runs
# from clobbering each other's files.

outputFiles:
  - task_outputs/report.md
  - task_outputs/analysis.md
# Relative paths to files the agent writes during execution.
# runner.py moves these to artifacts/ after kickoff completes.

# ─── Adapter configuration ───────────────────────────────────
configuration:
  baseUrl: http://localhost:8000       # REST agents
  internalSecret: ""                   # REST agents with auth
  note: "Any free-form notes"
```

---

## Interpreter Auto-Resolution

For `type: python` agents, the gateway automatically resolves the interpreter
by checking these paths relative to `workingDirectory`, in order:

```
1. .venv311/Scripts/python.exe   (Windows)
2. .venv311/bin/python            (Linux/macOS)
3. .venv/Scripts/python.exe      (Windows)
4. .venv/bin/python               (Linux/macOS)
5. venv/Scripts/python.exe       (Windows)
6. venv/bin/python                (Linux/macOS)
7. python                         (system fallback — last resort)
```

**You do NOT need to specify `interpreterPath` in agent.yaml.** It is resolved
at runtime and returned in health check responses and the agents list.

---

## Adding a New Agent

1. Create the directory: `agents/<id>/`
2. Write `agents/<id>/agent.yaml` using the schema above.
3. Implement the agent mode in `scripts/runner.py` (add a new `run_<mode>()` function).
4. Call `POST /api/agents/reload` — no server restart required.

**The agent source code stays in its original location.** Only the `agent.yaml`
manifest lives in `agents/<id>/`.

---

## Registered Agents

| ID | Type | Category | Phase | Working Directory |
|---|---|---|---|---|
| `hate-speech` | python | Content Moderation | 1 | `outskill/agents/beginner/` |
| `devops-log-analyzer` | python | DevOps | 1 | `outskill/agents/intermediate/v2/` |
| `stock-analyst` | python | Finance | 1 | `outskill/agents/advanced/v2/` |
| `podcaster-crew` | python | Content Creation | 1 | `outskill/podcaster_crew/` |
| `myntra-rag` | python | Knowledge / RAG | 2 | `outskill/rags/myntra_rag/` |
| `meeting-notes-api` | rest | Productivity | 1 | `lets-talk/ai-services/` |
