# Security Policy & Architecture

## Security Philosophy: Local-First & Zero Secret Leakage

**Agent OS / Agent Workspace** is designed with a **local-first security model**. The platform manages sensitive API keys (e.g. `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `SERPER_API_KEY`, `EXA_API_KEY`) and injects them dynamically into subprocess environments at execution time without persisting secrets in manifests, execution logs, or API responses.

---

## Key Security Controls

### 1. Encrypted Secrets Vault (`AES-256-GCM`)
- Secrets stored via the Dashboard Settings are encrypted using **AES-256-GCM** with a hardware/machine-derived key.
- Vault files (`data/secrets/vault.json`) contain only ciphertext and non-sensitive key names.
- Secrets are decrypted strictly in-memory by the Gateway process and injected directly into child process environment blocks.

### 2. Subprocess Runtime Isolation
- Each agent execution runs in an isolated Python subprocess managed by `uv`.
- Environment variables are scoped per execution and cleaned up immediately upon process termination.
- Process tree management ensures orphan processes are terminated cleanly on cancellation (`tree-kill`).

### 3. File System & Working Directory Locking
- Concurrent executions for agents sharing working directories utilize mutex locks to prevent race conditions and illegal file overwrites.

### 4. Zero Secret Logging Policy
- Execution logs (`logs.txt`) capture stdout/stderr streams from child processes.
- The Gateway automatically masks detected secret strings before broadcasting via Server-Sent Events (SSE) or persisting to disk.

---

## Reporting a Vulnerability

We take the security of **Agent OS** seriously. If you discover a security vulnerability or potential secret leak, please do **NOT** open a public GitHub issue.

Instead, please report it via one of the following methods:

1. **Email**: Send security advisories to `security@agent-os.dev` (or maintainer email).
2. **GitHub Security Advisory**: Submit a private advisory via the **Security** tab of this repository.

### What to Include in Your Report

- A detailed description of the vulnerability.
- Proof of Concept (PoC) or reproduction steps.
- Affected component(s) (`gateway`, `dashboard`, `secrets-vault`, `runtime-manager`).
- Any suggested remediations or mitigations.

### Response Timeline

- **Acknowledgment**: Within 48 hours.
- **Triage & Assessment**: Within 5 business days.
- **Patch Release**: High-severity issues patched within 14 days.

---

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 2.x     | :white_check_mark: |
| 1.x     | :x: |
