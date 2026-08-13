# Contributing to Agent OS / Agent Workspace

Thank you for your interest in contributing to **Agent OS / Agent Workspace**! We welcome contributions from developers of all skill levels.

---

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it to ensure a welcoming environment for everyone.

---

## How Can I Contribute?

- **Reporting Bugs**: Open an issue describing the bug, steps to reproduce, expected vs actual behavior, and environment details.
- **Suggesting Features**: Open a feature request issue with context on why the feature would be valuable.
- **Submitting Pull Requests**: Implement bug fixes, features, runtime enhancements, or documentation improvements.

---

## Local Development Setup

### Prerequisites

- **Node.js**: `>= 20.0.0`
- **npm**: `>= 10.0.0`
- **Python**: `>= 3.10`
- **uv**: `>= 0.4.0` (Fast Python package installer and virtual environment manager)
- **Docker & Docker Compose** (Optional, for containerized testing)

### Step-by-Step Setup

1. **Clone the Repository**
   ```bash
   git clone https://github.com/your-username/agent-workspace.git
   cd agent-workspace
   ```

2. **Install Node Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   ```bash
   cp .env.example .env
   cp apps/gateway/.env.example apps/gateway/.env
   cp apps/dashboard/.env.example apps/dashboard/.env
   ```

4. **Run Development Mode**
   ```bash
   npm run dev
   ```
   This boots the API Gateway on `http://localhost:4000` (or `8080`) and the Next.js Dashboard on `http://localhost:3000`.

---

## Repository Architecture

- **`apps/gateway`**: Node.js/TypeScript Express API Gateway, process manager, SSE streaming hub, and runtime manager.
- **`apps/dashboard`**: Next.js 16 / React 19 / Tailwind CSS Control Matrix UI.
- **`agents/`**: Standard workspace agent definitions (`agent.yaml` + executable scripts).
- **`external-agents/`**: Support for imported external agents (CrewAI, LangChain, Custom Python scripts).
- **`docs/`**: Platform documentation and runtime specifications.

---

## Coding Standards

### TypeScript & JavaScript
- Use TypeScript strict mode.
- Format code with Prettier and follow ESLint rules.
- Avoid using `any` types wherever possible.

### Python & Agent Packaging
- Maintain clean `agent.yaml` manifests following the [Agent Packaging Standard](docs/agent-packaging-standard.md).
- Use `uv` for sub-process dependency management.
- Ensure agents read secrets from environment variables dynamically rather than writing hardcoded credentials.

---

## Submitting Pull Requests

1. Fork the repository and create a feature branch (`git checkout -b feature/amazing-feature`).
2. Run validation checks:
   ```bash
   npm run build
   ```
3. Commit your changes with a clear commit message (`git commit -m "feat(gateway): add real-time execution cancellation"`).
4. Push to your fork (`git push origin feature/amazing-feature`).
5. Open a Pull Request against the `main` branch.

---

## Security & Secrets

**NEVER commit real API keys, credentials, or production databases!**
- Ensure all sensitive variables are listed in `.env.example` with blank placeholders.
- Run secret scans before pushing. See [SECURITY.md](SECURITY.md) for details on security reports.

---

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
