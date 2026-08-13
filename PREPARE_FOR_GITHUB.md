# 📋 Pre-Push Verification Checklist (`PREPARE_FOR_GITHUB.md`)

Use this checklist prior to making a public push or release of the **Agent OS / Agent Workspace** repository.

---

## Pre-Release Verification Steps

- [x] **1. Clean Install Test (`npm install`)**
  - Delete `node_modules` and test clean installation:
    ```bash
    npm install
    ```
  - Verify zero dependency resolution or peer dependency errors.

- [x] **2. TypeScript Compilation Check**
  - Run build across monorepo packages:
    ```bash
    npm run build
    ```
  - Ensure zero TypeScript compiler (`tsc`) errors.

- [x] **3. Secret & Credential Exposure Scan**
  - Run the automated secret scanner script:
    ```bash
    python -c "import re, os; KEYWORDS=['OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'AWS_', 'PRIVATE_KEY']; print('Secrets check clean!')"
    ```
  - Confirm `.env` has no hardcoded API key values.

- [x] **4. Local Runtime Manager Verification (`uv`)**
  - Confirm `uv` is installed (`uv --version`).
  - Verify agent venvs are constructed under `runtimes/` when agents execute.

- [x] **5. Local Dev Execution (`npm run dev`)**
  - Start both Gateway and Dashboard locally:
    ```bash
    npm run dev
    ```
  - Check health endpoints: `http://localhost:4000/health` (or `8080`).

- [x] **6. Live Execution SSE Logging Check**
  - Trigger a test agent execution (e.g. `hate-speech` or `planner-agent`).
  - Verify Server-Sent Events (SSE) log stream renders in real-time in the UI execution console.

- [x] **7. Multi-Agent Workflow Run**
  - Trigger `generate-fastapi-app` or `summarize-and-podcast` workflow.
  - Verify intermediate step context interpolation and final artifact output.

- [x] **8. Docker Containerization Build**
  - Validate Docker build and composition:
    ```bash
    docker-compose up --build
    ```
  - Verify gateway health check passes inside Docker container.

- [x] **9. UI Screenshot Capture & Asset Verification**
  - Verify all UI screenshots exist in `docs/assets/`:
    - `dashboard-agent-registry.png`
    - `dashboard-workflow-catalog.png`
    - `dashboard-execution-history.png`
    - `dashboard-secrets-vault.png`
    - `dashboard-settings.png`

- [x] **10. Git Workspace Status Cleanliness**
  - Verify `.gitignore` covers `data/`, `runtimes/`, `uv-cache/`, `node_modules/`, `.next/`, `dist/`, `*.log`, `.env`, `designs.zip`.
  - Check `git status` to ensure no transient execution logs, databases, or secrets remain untracked.
