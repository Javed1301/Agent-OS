# Agent OS / Agent Workspace — API Reference

This document details the REST API endpoints and Server-Sent Event (SSE) interfaces exposed by the Agent Workspace API Gateway (`http://localhost:4000` or `http://localhost:8080`).

---

## Base URLs

- **Local Gateway**: `http://localhost:4000` (or `http://localhost:8080`)
- **API Prefix**: `/api`

---

## 1. Agent Management

### `GET /api/agents`
List all registered agents discovered across standard `agents/` and imported `external-agents/`.

### `GET /api/agents/:id`
Get detailed metadata and input schema for a single agent.

### `GET /api/agents/:id/health`
Trigger a real-time health check for an agent (verifies interpreter, dependencies, and environment variables).

### `POST /api/agents/reload`
Hot-reload the agent registry without restarting the gateway server.

---

## 2. Executions & Streaming

### `POST /api/agents/:id/execute`
Trigger execution of an agent with structured JSON input. Returns `202 Accepted` with an `executionId`.

### `GET /api/executions/:id/stream`
Server-Sent Events (SSE) stream for real-time logs, progress events, and execution results.

### `GET /api/executions`
Retrieve paginated execution history with optional filtering by `agentId` or `status`.

### `GET /api/executions/:id`
Get full execution details including execution status, duration, logs path, and generated output artifacts.

### `GET /api/executions/:id/logs`
Read raw execution logs.

### `POST /api/executions/:id/cancel`
Cancel an active execution immediately using process tree termination (`tree-kill`).

---

## 3. Workflows

### `GET /api/workflows`
List available multi-agent workflow templates.

### `GET /api/workflows/:id`
Get specific workflow definition and step mapping.

### `POST /api/workflows/:id/execute`
Execute a multi-agent workflow pipeline.

---

## 4. Secrets Vault & Runtimes

### `GET /api/secrets`
List stored local secret key names and status (values are masked/encrypted).

### `POST /api/secrets`
Encrypt and save an API key to the local AES-256-GCM vault.

### `GET /api/runtimes`
Inspect managed `uv` virtual environments, disk usage, and fingerprint status.

### `POST /api/runtimes/gc`
Trigger garbage collection of stale or orphaned virtual environments.

---

## Health & System Status

### `GET /health` or `GET /api/health`
Returns system status, discovered agent counts, version, and process capability indicators.
