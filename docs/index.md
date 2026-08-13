# Agent OS / Agent Workspace Documentation Index

Welcome to the **Agent OS / Agent Workspace** documentation hub. This index provides quick navigation to the platform's architectural specifications, runtime guides, API contracts, and contribution standards.

---

## Core Documentation Map

- 📐 **[Platform Architecture](architecture.md)**
  Comprehensive breakdown of the API Gateway, Registry Service, Health Engine, Execution Engine, Store Service, and Process Adapters.

- ⚡ **[Runtime Architecture & `uv` Integration](runtime-architecture.md)**
  In-depth guide to content-addressed Python environments, dependency graph hashing, package caching, stale detection, and automated garbage collection.

- 🔌 **[API Reference](api.md)**
  Full API contract documentation for REST endpoints, SSE execution streams, agent health checks, secret vault management, and workflow triggers.

- 🔄 **[Workflows Architecture & Specifications](workflows.md)**
  Guide to multi-agent workflow composition, step parameter mapping, graph execution, and pre-built workflow templates.

- 📦 **[Agent Packaging Standard](agent-packaging-standard.md)**
  Specification for packaging custom local agents with `agent.yaml`, input schemas, runner scripts, and environmental requirements.

---

## Developer & Security Guides

- 🤝 **[Contributing Guide](../CONTRIBUTING.md)**
  Step-by-step instructions for local development setup, coding standards, pull request workflows, and repository etiquette.

- 🛡️ **[Security Policy & Architecture](../SECURITY.md)**
  Details on local-first security philosophy, AES-256-GCM encrypted secrets vault, zero-log secret masking, and vulnerability reporting procedures.

---

## Quick Navigation Summary

| Document | Focus Area | Audience |
| --- | --- | --- |
| [Architecture](architecture.md) | Gateway & Service Mechanics | Core Maintainers & Integrators |
| [Runtime Architecture](runtime-architecture.md) | `uv` Runtimes & Subprocesses | Python Developers & System Architects |
| [API Reference](api.md) | Endpoints & SSE Streaming | Frontend & API Developers |
| [Workflows](workflows.md) | Multi-Agent Pipelines | Orchestration Developers |
| [Packaging Standard](agent-packaging-standard.md) | Agent Manifests & Definitions | Agent Authors |
| [Contributing](../CONTRIBUTING.md) | Codebase Rules & PR Setup | Community Contributors |
| [Security Policy](../SECURITY.md) | Vault Encryption & Safety | Security Researchers & Operators |
