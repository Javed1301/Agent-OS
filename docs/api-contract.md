# Agent Workspace — API Contract

## Base URL

```
http://localhost:8080
```

---

## Agents

### `GET /api/agents`

List all registered agents discovered from `agents/*/agent.yaml`.

**Response**
```json
{
  "agents": [
    {
      "id": "hate-speech",
      "name": "Hate Speech Detector",
      "description": "...",
      "category": "Content Moderation",
      "type": "python",
      "version": "1.0.0",
      "capabilities": ["text-classification", "hate-speech-detection"],
      "workingDirectory": "D:/Javed/outskill/outskill/agents/beginner",
      "entrypoint": "hate-speech-detector",
      "interpreterPath": "D:/Javed/outskill/outskill/.venv311/Scripts/python.exe",
      "healthCheck": { "type": "subprocess", "requiredEnv": ["OPENROUTER_API_KEY"] },
      "inputSchema": {
        "type": "object",
        "properties": {
          "text": { "type": "string", "required": true, "description": "..." }
        }
      },
      "outputFiles": [],
      "usesWdLock": false,
      "icon": "shield",
      "phase": 1
    }
  ],
  "count": 6
}
```

---

### `GET /api/agents/:id`

Get a single agent by ID.

**Example:** `GET /api/agents/hate-speech`

**Response:** Single `AgentDefinition` object (same schema as above).

**Errors:**
- `404 Not Found` — agent ID does not exist

---

### `GET /api/agents/:id/health`

Run a real-time health check on the agent.

**Example:** `GET /api/agents/stock-analyst/health`

**Response**
```json
{
  "agentId": "stock-analyst",
  "status": "available",
  "checkedAt": "2026-08-12T13:45:22.000Z",
  "detail": "Interpreter reachable: D:/Javed/outskill/outskill/.venv311/Scripts/python.exe",
  "interpreterFound": true,
  "interpreterPath": "D:/Javed/outskill/outskill/.venv311/Scripts/python.exe"
}
```

**Status values:**
| Value | Meaning |
|---|---|
| `available` | Agent is ready to execute |
| `unavailable` | HTTP endpoint not reachable (REST agents) |
| `misconfigured` | Missing env vars, interpreter, or working directory |
| `unknown` | Interpreter check timed out or other transient error |

---

### `POST /api/agents/reload`

Hot-reload the agent registry by rescanning `agents/*/agent.yaml`. No restart needed.

**Response**
```json
{
  "message": "Registry reloaded.",
  "count": 6,
  "agents": ["hate-speech", "devops-log-analyzer", "stock-analyst", "podcaster-crew", "myntra-rag", "meeting-notes-api"]
}
```

---

## Executions

### `POST /api/agents/:id/execute`

Start executing an agent. Returns immediately with an `executionId`.

**Example:** `POST /api/agents/hate-speech/execute`

**Request Body**
```json
{
  "text": "People from that region are all criminals."
}
```

**Response** `202 Accepted`
```json
{
  "executionId": "exec_20260812_a1b2c3d4",
  "agentId": "hate-speech",
  "status": "queued"
}
```

---

### `GET /api/executions/:id/stream`

Server-Sent Events (SSE) stream for a running execution.

**Example:** `GET /api/executions/exec_20260812_a1b2c3d4/stream`

**Response** `text/event-stream`

```
data: {"type":"status","data":"started","executionId":"exec_20260812_a1b2c3d4","timestamp":"2026-08-12T13:45:23.000Z"}

data: {"type":"log","data":"Loading Hate Speech Detector crew...","executionId":"exec_20260812_a1b2c3d4","timestamp":"..."}

data: {"type":"log","data":"Crew assembled. Running kickoff...","executionId":"exec_20260812_a1b2c3d4","timestamp":"..."}

data: {"type":"result","data":{"answer":"HATE SPEECH DETECTED: The text contains...","text":"..."},"executionId":"exec_20260812_a1b2c3d4","timestamp":"..."}

data: {"type":"status","data":"completed","executionId":"exec_20260812_a1b2c3d4","timestamp":"..."}
```

**SSE Event Types:**
| Type | Meaning |
|---|---|
| `status` | `queued`, `started`, `completed`, `failed`, `cancelled` |
| `log` | Real-time log line from the agent |
| `result` | Final structured output from the agent |
| `error` | Error message (agent will also emit `status: failed`) |
| `warning` | Non-fatal warning (e.g., missing optional output file) |

---

### `GET /api/executions`

List execution history. Optional `?agentId=` filter.

**Example:** `GET /api/executions?agentId=stock-analyst`

**Response**
```json
{
  "executions": [
    {
      "id": "exec_20260812_a1b2c3d4",
      "agentId": "stock-analyst",
      "status": "completed",
      "startTime": "2026-08-12T13:45:22.000Z",
      "endTime": "2026-08-12T13:49:11.000Z",
      "durationMs": 229000
    }
  ],
  "count": 1
}
```

---

### `GET /api/executions/:id`

Get full execution record including result and file paths.

**Response**
```json
{
  "id": "exec_20260812_a1b2c3d4",
  "agentId": "stock-analyst",
  "input": { "stock": "RELIANCE" },
  "status": "completed",
  "startTime": "2026-08-12T13:45:22.000Z",
  "endTime": "2026-08-12T13:49:11.000Z",
  "durationMs": 229000,
  "runDir": "D:/Javed/Agent-Dashboard/data/executions/exec_20260812_a1b2c3d4",
  "logPath": "D:/Javed/Agent-Dashboard/data/executions/exec_20260812_a1b2c3d4/logs.txt",
  "outputFiles": {
    "financial_analysis.md": "D:/Javed/Agent-Dashboard/data/executions/exec_20260812_a1b2c3d4/artifacts/financial_analysis.md",
    "investment_recommendation.md": "D:/Javed/Agent-Dashboard/data/executions/exec_20260812_a1b2c3d4/artifacts/investment_recommendation.md"
  },
  "result": { "stock": "RELIANCE", "recommendation": { ... } }
}
```

---

### `GET /api/executions/:id/logs`

Read the raw log file for an execution.

**Response**
```json
{
  "executionId": "exec_20260812_a1b2c3d4",
  "logs": "2026-08-12T13:45:22.001Z [gateway] Working-directory lock acquired.\n2026-08-12T13:45:22.100Z [python-adapter] Spawning: ...\n..."
}
```

---

### `POST /api/executions/:id/cancel`

Cancel a running execution. Uses tree-kill to terminate the entire process tree.

**Response**
```json
{
  "executionId": "exec_20260812_a1b2c3d4",
  "status": "cancelled"
}
```

**Errors:**
- `404 Not Found` — execution not running or already finished

---

## Health Check

### `GET /health`

Gateway health check.

**Response**
```json
{
  "status": "ok",
  "service": "agent-workspace-gateway",
  "version": "2.0.0",
  "port": 8080,
  "agentsDiscovered": 6,
  "agentIds": ["hate-speech", "devops-log-analyzer", "stock-analyst", "podcaster-crew", "myntra-rag", "meeting-notes-api"]
}
```
