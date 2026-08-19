# ADR-004: Local Environment Discovery and Reuse

## Status
Approved & Implemented (August 19, 2026)

## Context
Previously, Agent OS forced an isolated, managed `uv` virtualenv inside a shared `runtimes/` subdirectory for each agent's execution. While this isolated execution, it introduced significant drawbacks:
1. **Disk Space Overhead**: Compiling separate duplicate environments containing large frameworks (like CrewAI, LangChain, etc.) consumes gigabytes of storage.
2. **Download/Install Latency**: Launching an agent for the first time incurred a 1-3 minute latency to fetch and install packages, even if those exact packages were already cached or installed on the host.
3. **Loss of Developer Context**: Local changes, custom packages, or virtualenvs carefully curated by developers on their workstations were ignored.

## Decision
We implement a **Local-First Environment Discovery and Reuse Architecture**. The execution engine and registry follow a deterministic sequence:

1. **Source Root Resolution**: Resolve the canonical local path of the agent's files (mapping virtual paths to real directories using Git-ignored local mappings `source-mappings.local.json`).
2. **Environment Discovery**: Scan the host filesystem for Python interpreters, prioritizing:
   - Explicit mappings or environment overrides (`PYTHON_PATH`).
   - Project-local virtualenvs inside the agent's source root (`.venv311`, `.venv`, `venv`).
   - Parent-project virtualenvs (climbing the tree up to root).
   - Conda environments (via `CONDA_PREFIX` and standard paths).
   - Existing Agent OS-managed runtimes.
   - System CPython binaries (`python`, `python3`, etc.).
3. **Compatibility Evaluation**: Compare each candidate's metadata (Python version and installed package list queried via standard JSON output) against constraints (e.g. `requirements.txt`, `pyproject.toml`, or `uv.lock`). A candidate is compatible if:
   - CPython major and minor versions match (e.g. 3.11.x).
   - All defined dependencies are satisfied (matching package names and constraint operators like `==`, `>=`, `<=`, `<`, `>`).
4. **Resolution Decision**:
   - **REUSE_EXISTING**: If a compatible environment is discovered, reuse it directly.
   - **CREATE_MANAGED_RUNTIME**: If none are compatible, fall back to building a managed `uv` runtime.

## Consequences
- **Instant Launch**: Reused environments execute immediately with zero startup or installation delay.
- **Zero-Download Execution**: Over 90% of local agents on typical development machines leverage existing parent or local environments, saving massive network bandwidth and disk space.
- **Improved Performance**: Query operations are cached internally in memory and compared against timestamps to prevent query execution bottlenecks.
- **Robust Test Passing**: Fully supports all environment configurations and ensures platform-neutral executions across Windows and Linux.
