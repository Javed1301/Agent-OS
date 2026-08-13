"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AppShell,
  GlassPanel,
  SectionHeader,
  PrimaryButton,
  SecondaryButton,
} from "@/components/primitives";

// ─── Utility components ─────────────────────────────────────────────────────

function Badge({ children, color = "gold" }: { children: React.ReactNode; color?: "gold" | "violet" | "teal" | "red" }) {
  const colorMap = {
    gold: "border-[#C7A66B]/40 bg-[#C7A66B]/10 text-[#E2C48D]",
    violet: "border-[#7A5AF8]/40 bg-[#7A5AF8]/10 text-[#a68ff8]",
    teal: "border-[#2DD4BF]/40 bg-[#2DD4BF]/10 text-[#2DD4BF]",
    red: "border-red-500/40 bg-red-900/10 text-red-300",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide ${colorMap[color]}`}>
      {children}
    </span>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <GlassPanel className="p-5 transition duration-300 hover:-translate-y-1 hover:border-[#C7A66B]/40 cursor-default h-full">
      <div className="text-2xl mb-3">{icon}</div>
      <h3 className="font-semibold text-[#F5F5F7] mb-2 text-sm">{title}</h3>
      <p className="text-xs text-[#B3B7C2] leading-relaxed">{description}</p>
    </GlassPanel>
  );
}

function StepCard({ number, title, description, detail }: { number: string; title: string; description: string; detail: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-[#C7A66B]/30 to-[#7A5AF8]/20 border border-[#C7A66B]/30 flex items-center justify-center text-sm font-bold text-[#E2C48D]">
        {number}
      </div>
      <div className="min-w-0">
        <h3 className="font-semibold text-[#F5F5F7] text-sm mb-1">{title}</h3>
        <p className="text-xs text-[#B3B7C2] mb-1.5">{description}</p>
        <p className="text-[11px] text-[#6E7482] font-mono">{detail}</p>
      </div>
    </div>
  );
}

function CheckItem({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      <span className={`flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold ${
        done
          ? "border-[#2DD4BF]/60 bg-[#2DD4BF]/10 text-[#2DD4BF]"
          : "border-[#2A2E36] bg-[#16181D] text-[#6E7482]"
      }`}>
        {done ? "✓" : "○"}
      </span>
      <span className={done ? "text-[#F5F5F7]" : "text-[#6E7482]"}>{label}</span>
    </li>
  );
}

function RoadmapItem({ phase, title, items, active = false }: { phase: string; title: string; items: string[]; active?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${active ? "border-[#C7A66B]/40 bg-[#C7A66B]/5" : "border-[#2A2E36] bg-[#16181D]"}`}>
      <div className="flex items-center gap-2 mb-3">
        <Badge color={active ? "gold" : "violet"}>{phase}</Badge>
        <h3 className="font-semibold text-sm text-[#F5F5F7]">{title}</h3>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-[#B3B7C2] flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? "bg-[#C7A66B]" : "bg-[#7A5AF8]"}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function LaunchpadPage() {
  const [codeTab, setCodeTab] = useState<"yaml" | "curl" | "output">("yaml");

  const yamlExample = `id: stock-researcher
name: Stock Research Agent
description: Analyzes stock prices using yfinance and generates reports.
category: Finance
type: python
version: 1.0.0
capabilities:
  - stock-data
  - report-generation
  - portfolio-analysis
workingDirectory: D:/AI/agents/stock-crew
entrypoint: runner.py
healthcheck:
  requiredEnv:
    - OPENAI_API_KEY
inputs:
  ticker:
    type: string
    required: true
    description: Stock ticker symbol (e.g., AAPL)
  period:
    type: string
    default: "30d"
    description: Analysis period`;

  const curlExample = `# Import an existing agent from any local folder:
curl -X POST http://localhost:4000/api/registry/import \\
  -H "Content-Type: application/json" \\
  -d '{"path": "D:/AI/agents/stock-crew"}'

# Run a quick test:
curl -X POST http://localhost:4000/api/agents/stock-researcher/execute \\
  -H "Content-Type: application/json" \\
  -d '{"ticker": "AAPL", "period": "7d"}'

# Stream live logs:
curl -N http://localhost:4000/api/executions/exec_20260813_a1b2/stream`;

  const outputExample = `✓ Registered agent: stock-researcher
✓ Type: python | Interpreter: .venv311/Scripts/python.exe
✓ Health: available
✓ Capabilities: stock-data, report-generation

Execution exec_20260813_a1b2 started...
[01] Loading AAPL price data (7d)...
[02] Computing moving averages...
[03] Generating PDF report...
[04] Artifacts: report.pdf, data.csv

✓ Completed in 4.2s`;

  const codeContent = { yaml: yamlExample, curl: curlExample, output: outputExample };

  return (
    <AppShell
      title="Launchpad — Agent OS"
      topActions={
        <div className="flex gap-2">
          <Link href="/agents">
            <SecondaryButton>Agent Registry</SecondaryButton>
          </Link>
          <Link href="/">
            <PrimaryButton>Go to Dashboard</PrimaryButton>
          </Link>
        </div>
      }
    >
      <div className="space-y-10 pb-10 animate-fade-in">

        {/* ── Section 1: Hero ─────────────────────────────────────────────── */}
        <GlassPanel className="p-8 md:p-12 overflow-hidden relative">
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl opacity-40"
            style={{
              background:
                "radial-gradient(ellipse at 80% 50%, rgba(199,166,107,0.25), transparent 55%), radial-gradient(ellipse at 20% 80%, rgba(122,90,248,0.18), transparent 50%)",
            }}
          />
          <div className="relative z-10">
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge color="gold">MVP-1</Badge>
              <Badge color="violet">Local-First</Badge>
              <Badge color="teal">v2.1.0</Badge>
            </div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-[#F5F5F7] mb-4 leading-tight">
              Agent OS —{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(135deg, #E2C48D 0%, #C7A66B 40%, #a68ff8 100%)" }}
              >
                Control Matrix
              </span>
            </h1>
            <p className="text-lg text-[#B3B7C2] mb-6 max-w-2xl leading-relaxed">
              A single dashboard to <strong className="text-[#F5F5F7]">import</strong>,{" "}
              <strong className="text-[#F5F5F7]">inspect</strong>,{" "}
              <strong className="text-[#F5F5F7]">test</strong>,{" "}
              <strong className="text-[#F5F5F7]">run</strong>, and{" "}
              <strong className="text-[#F5F5F7]">observe</strong> any local AI agent — regardless of framework.
            </p>
            <p className="text-sm text-[#6E7482] max-w-xl">
              Agent OS is <em>not</em> a chatbot. It is a local control plane for independently developed AI agents.
              You already have CrewAI projects, LangGraph apps, FastAPI services, Ollama tools, and Python scripts
              scattered across different folders. Agent OS unifies them.
            </p>
          </div>
        </GlassPanel>

        {/* ── Workflow Guide ──────────────────────────────────────────────── */}
        <section className="grid gap-4 lg:grid-cols-1">
          <GlassPanel className="p-6 md:p-8 min-w-0">
            <SectionHeader eyebrow="User Guide" title="How Workflows Work" />
            <div className="grid gap-6 md:grid-cols-[1.2fr_1fr] mt-4">
              <div className="space-y-4">
                <p className="text-sm text-[#B3B7C2] leading-relaxed">
                  Workflows orchestrate multiple agents sequentially. Follow these steps to build and run them:
                </p>
                <div className="grid gap-3 sm:grid-cols-2 text-xs">
                  <div className="rounded-xl border border-[#2A2E36] bg-[#16181D]/40 p-3">
                    <span className="font-semibold text-[#E2C48D] block mb-1">Step 1 — Open Workflows</span>
                    <span className="text-[#B3B7C2]">Go to the Workflows page from the sidebar.</span>
                  </div>
                  <div className="rounded-xl border border-[#2A2E36] bg-[#16181D]/40 p-3">
                    <span className="font-semibold text-[#E2C48D] block mb-1">Step 2 — Choose a Workflow</span>
                    <span className="text-[#B3B7C2]">Select a template (e.g. <code>summarize-and-podcast</code>).</span>
                  </div>
                  <div className="rounded-xl border border-[#2A2E36] bg-[#16181D]/40 p-3">
                    <span className="font-semibold text-[#E2C48D] block mb-1">Step 3 — Fill the Inputs</span>
                    <span className="text-[#B3B7C2]">Enter values such as goal, topic, or requirements.</span>
                  </div>
                  <div className="rounded-xl border border-[#2A2E36] bg-[#16181D]/40 p-3">
                    <span className="font-semibold text-[#E2C48D] block mb-1">Step 4 — Run</span>
                    <span className="text-[#B3B7C2]">Click <strong>Start Orchestrated Workflow</strong>.</span>
                  </div>
                  <div className="rounded-xl border border-[#2A2E36] bg-[#16181D]/40 p-3">
                    <span className="font-semibold text-[#E2C48D] block mb-1">Step 5 — Watch Live Progress</span>
                    <span className="text-[#B3B7C2]">View each step and agent executing in real time.</span>
                  </div>
                  <div className="rounded-xl border border-[#2A2E36] bg-[#16181D]/40 p-3">
                    <span className="font-semibold text-[#E2C48D] block mb-1">Step 6 — Open Artifacts</span>
                    <span className="text-[#B3B7C2]">Inspect generated files and logs from every step.</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col justify-between rounded-xl border border-[#2A2E36] bg-black p-4 shrink-0 min-w-0">
                <div>
                  <span className="text-[10px] font-mono text-[#6E7482] uppercase tracking-wider block mb-2">Example Manifest (YAML)</span>
                  <pre className="text-xs text-[#E2C48D] font-mono whitespace-pre overflow-x-auto leading-5 pb-2">
{`steps:
  - id: summarize
    agent: meeting-notes-api
  - id: podcast
    agent: podcaster-crew
    input:
      notes: \${summarize.output.summary}`}
                  </pre>
                </div>
                <p className="text-xs text-[#B3B7C2] border-t border-[#2A2E36] pt-3 leading-relaxed mt-2">
                  Outputs from earlier steps can be reused by later steps, allowing agents to collaborate automatically.
                </p>
              </div>
            </div>
          </GlassPanel>
        </section>

        {/* ── Section 2: What we provide ──────────────────────────────────── */}
        <section>
          <SectionHeader eyebrow="Platform" title="What Agent OS Provides" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard icon="🗂️" title="Agent Registry" description="Discover and register agents from any local folder. Workspace agents auto-detected. External agents imported with one path." />
            <FeatureCard icon="🩺" title="Health Checks" description="Structured health verification: working directory, entrypoint, Python environment, required env vars — all shown as a checklist." />
            <FeatureCard icon="🧪" title="Quick Test Runner" description="Launch any agent from the browser. Provide inputs via a dynamic form. Logs stream in real-time. No terminal required." />
            <FeatureCard icon="📺" title="Live Log Streaming" description="SSE-powered terminal panel. Auto-scroll during execution. Pause when you scroll up. Full horizontal + vertical scroll." />
            <FeatureCard icon="📁" title="Artifact Management" description="Generated files (PDFs, CSVs, Python scripts, YAML) are listed and viewable in-browser. Open containing folder in Explorer." />
            <FeatureCard icon="🔗" title="Sequential Workflows" description="Chain multiple agents into a pipeline. Each step receives the output of the previous. Execution tracked end-to-end." />
          </div>
        </section>

        {/* ── Section 3: How it works ─────────────────────────────────────── */}
        <GlassPanel className="p-6 md:p-8">
          <SectionHeader eyebrow="Architecture" title="How It Works" />
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-5">
              <StepCard
                number="1"
                title="Create an agent.yaml"
                description="Place an agent.yaml in your agent's folder. Describe the entrypoint, inputs, capabilities, and health requirements."
                detail="agents/my-agent/agent.yaml"
              />
              <StepCard
                number="2"
                title="Import or auto-discover"
                description="Workspace agents (in the agents/ folder) are auto-discovered. Any external agent can be imported by pasting its absolute folder path."
                detail="POST /api/registry/import { path: 'D:/AI/my-agent' }"
              />
              <StepCard
                number="3"
                title="Inspect + health check"
                description="Agent OS reads the manifest, resolves the Python interpreter, checks required env vars, and shows a structured health report."
                detail="GET /api/agents/:id/health"
              />
              <StepCard
                number="4"
                title="Run + observe"
                description="Click Run. A subprocess starts, logs stream via SSE, and artifacts are captured in an isolated execution directory."
                detail="data/executions/<id>/artifacts/"
              />
            </div>
            <div className="space-y-4">
              <div className="rounded-xl border border-[#2A2E36] bg-[#08090B] overflow-hidden">
                <div className="flex border-b border-[#2A2E36]">
                  {(["yaml", "curl", "output"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setCodeTab(tab)}
                      className={`px-4 py-2 text-xs uppercase tracking-[0.14em] transition cursor-pointer ${
                        codeTab === tab
                          ? "bg-[#C7A66B]/10 text-[#E2C48D] border-b-2 border-[#C7A66B]"
                          : "text-[#6E7482] hover:text-[#B3B7C2]"
                      }`}
                    >
                      {tab === "yaml" ? "agent.yaml" : tab === "curl" ? "API calls" : "Output"}
                    </button>
                  ))}
                </div>
                <pre className="p-4 text-[11px] font-mono text-[#E2C48D] leading-5 overflow-x-auto whitespace-pre">
                  {codeContent[codeTab]}
                </pre>
              </div>
            </div>
          </div>
        </GlassPanel>

        {/* ── Section 4: FastAPI workflow example ─────────────────────────── */}
        <GlassPanel className="p-6 md:p-8">
          <SectionHeader eyebrow="Real Example" title="FastAPI Agent Integration" />
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-sm text-[#B3B7C2] mb-4 leading-relaxed">
                You have a FastAPI service that wraps an LLM. It runs on <code className="text-[#E2C48D] text-xs bg-[#16181D] px-1.5 py-0.5 rounded">localhost:8001</code>.
                Register it as a REST agent:
              </p>
              <div className="rounded-xl border border-[#2A2E36] bg-[#08090B] p-4">
                <pre className="text-[11px] font-mono text-[#E2C48D] leading-5 whitespace-pre overflow-x-auto">{`id: fastapi-llm
name: FastAPI LLM Service
type: rest
category: Language Model
capabilities:
  - text-generation
  - summarization
workingDirectory: D:/projects/fastapi-llm
entrypoint: main.py
healthcheck:
  type: http
  endpoint: http://localhost:8001/health
configuration:
  baseUrl: http://localhost:8001
  internalSecret: my-secret`}
                </pre>
              </div>
            </div>
            <div>
              <p className="text-sm text-[#B3B7C2] mb-4 leading-relaxed">
                Agent OS will hit <code className="text-[#E2C48D] text-xs bg-[#16181D] px-1.5 py-0.5 rounded">/health</code> to verify the service is running,
                then show it as <Badge color="teal">available</Badge> in the registry.
                Execution goes through the REST adapter — no subprocess spawning needed.
              </p>
              <div className="space-y-3">
                <div className="rounded-xl border border-[#2A2E36] bg-[#16181D] p-3">
                  <p className="text-[11px] text-[#B3B7C2] uppercase tracking-wide mb-1">Expected health response</p>
                  <pre className="text-xs font-mono text-[#2DD4BF]">{`{"status": "healthy", "provider": "openai", "model": "gpt-4o"}`}</pre>
                </div>
                <div className="rounded-xl border border-[#2A2E36] bg-[#16181D] p-3">
                  <p className="text-[11px] text-[#B3B7C2] uppercase tracking-wide mb-1">What Agent OS detects</p>
                  <div className="space-y-1">
                    <div className="text-xs text-[#2DD4BF]">✓ Health endpoint configured</div>
                    <div className="text-xs text-[#2DD4BF]">✓ HTTP 200 — provider=openai, model=gpt-4o</div>
                    <div className="text-xs text-[#2DD4BF]">✓ Status: available</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </GlassPanel>

        {/* ── Section 5: Where generated code is stored ───────────────────── */}
        <GlassPanel className="p-6 md:p-8">
          <SectionHeader eyebrow="Filesystem" title="Where Generated Files Are Stored" />
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-sm text-[#B3B7C2] mb-4 leading-relaxed">
                Every execution gets an isolated directory under <code className="text-[#E2C48D] text-xs bg-[#16181D] px-1.5 py-0.5 rounded">data/executions/</code>.
                Nothing is ever overwritten. Each run is self-contained.
              </p>
              <div className="rounded-xl border border-[#2A2E36] bg-[#08090B] p-4">
                <pre className="text-[11px] font-mono text-[#B3B7C2] leading-6 whitespace-pre">{`data/
├── executions/
│   ├── index.json         ← execution index
│   └── exec_20260813_a1b2c3d4/
│       ├── input.json     ← what was passed in
│       ├── output.json    ← execution record
│       ├── logs.txt       ← raw logs (timestamped)
│       └── artifacts/     ← agent output files
│           ├── report.pdf
│           ├── data.csv
│           └── plan.md
│
├── registry/
│   └── external-agents.json  ← imported agents list
│
└── logs/                  ← legacy log directory`}
                </pre>
              </div>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-[#2A2E36] bg-[#16181D] p-4">
                <p className="text-xs font-semibold text-[#F5F5F7] mb-2">External Agent Registry</p>
                <p className="text-xs text-[#B3B7C2] mb-3">Imported agents persist across restarts in <code className="text-[#E2C48D]">external-agents.json</code>:</p>
                <pre className="text-[11px] font-mono text-[#E2C48D]">{`[
  {
    "id": "stock-researcher",
    "path": "D:/AI/agents/stock-crew"
  },
  {
    "id": "pdf-analyzer",
    "path": "D:/projects/pdf-bot"
  }
]`}
                </pre>
              </div>
              <div className="rounded-xl border border-[#2A2E36] bg-[#16181D] p-4">
                <p className="text-xs font-semibold text-[#F5F5F7] mb-2">Retention Policy</p>
                <ul className="space-y-1 text-xs text-[#B3B7C2]">
                  <li>• Max 50 executions retained</li>
                  <li>• Auto-pruned after 14 days</li>
                  <li>• Max 5 MB per log file</li>
                  <li>• Artifacts stay until pruned</li>
                </ul>
              </div>
            </div>
          </div>
        </GlassPanel>

        {/* ── Section 6: Use cases ────────────────────────────────────────── */}
        <section>
          <SectionHeader eyebrow="Applications" title="Use Cases" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard icon="📈" title="CrewAI Finance Agents" description="Import your CrewAI stock analysis crew. Run research tasks with a single click. View generated reports directly in the dashboard." />
            <FeatureCard icon="🔍" title="RAG Systems" description="Connect a LangGraph RAG pipeline. Test queries interactively. Inspect retrieved context and generated answers as artifacts." />
            <FeatureCard icon="👨‍💻" title="Code Review Bots" description="Point to your code review Python script. Run it on demand with a file path as input. Get structured feedback as an artifact." />
            <FeatureCard icon="📝" title="Log Analyzers" description="Import a log analysis agent. Drop log files as input. Get anomaly reports and summaries saved to the artifacts folder." />
            <FeatureCard icon="🤖" title="Ollama-Powered Tools" description="Wrap any Ollama-powered CLI tool as a Python agent. Test different prompts and models without leaving your browser." />
            <FeatureCard icon="⚙️" title="FastAPI AI Services" description="Register any running FastAPI service as a REST agent. Health check it continuously. Trigger inference from the UI." />
          </div>
        </section>

        {/* ── Section 7: Current status ───────────────────────────────────── */}
        <div className="grid gap-6 md:grid-cols-2">
          <GlassPanel className="p-6">
            <SectionHeader eyebrow="MVP-1" title="Current Status" />
            <ul className="space-y-2.5">
              <CheckItem done label="Agent Registry (workspace auto-discovery)" />
              <CheckItem done label="Import external agents from any local folder" />
              <CheckItem done label="Imported agents persist across restart" />
              <CheckItem done label="Structured health check checklist" />
              <CheckItem done label="Python venv auto-resolution (.venv311 → system)" />
              <CheckItem done label="Quick test runner from agent detail page" />
              <CheckItem done label="Live SSE log streaming" />
              <CheckItem done label="Auto-scroll + manual pause on scroll up" />
              <CheckItem done label="Artifact viewer (py, md, json, yaml, txt)" />
              <CheckItem done label="Open artifacts folder in OS Explorer" />
              <CheckItem done label="Sequential workflow execution" />
              <CheckItem done label="Execution history with persistence" />
              <CheckItem done label="Launchpad product guide" />
            </ul>
          </GlassPanel>

          <GlassPanel className="p-6">
            <SectionHeader eyebrow="Agent Types" title="Supported Agent Formats" />
            <div className="space-y-3">
              {[
                { type: "Python", detail: "subprocess with venv auto-resolution", done: true },
                { type: "REST / FastAPI", detail: "HTTP adapter with health endpoint check", done: true },
                { type: "CLI tools", detail: "any command-line script or binary", done: true },
                { type: "CrewAI", detail: "via Python adapter + runner.py", done: true },
                { type: "LangGraph", detail: "via Python adapter + runner.py", done: true },
                { type: "Ollama tools", detail: "via Python adapter or REST", done: true },
                { type: "Node.js", detail: "adapter available but not yet exposed", done: false },
                { type: "WebSocket", detail: "planned for Phase 2", done: false },
              ].map((item) => (
                <div key={item.type} className="flex items-center justify-between rounded-lg border border-[#2A2E36] bg-[#16181D] px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-[#F5F5F7]">{item.type}</p>
                    <p className="text-[11px] text-[#6E7482]">{item.detail}</p>
                  </div>
                  <Badge color={item.done ? "teal" : "violet"}>{item.done ? "Ready" : "Planned"}</Badge>
                </div>
              ))}
            </div>
          </GlassPanel>
        </div>

        {/* ── Section 8: Future roadmap ───────────────────────────────────── */}
        <GlassPanel className="p-6 md:p-8">
          <SectionHeader eyebrow="Vision" title="Future Roadmap" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <RoadmapItem
              phase="MVP-1 · Now"
              title="Local Control Plane"
              active
              items={[
                "Import agents from any folder",
                "Health check checklist",
                "Quick test runner",
                "Live log streaming",
                "Artifact viewer",
                "Open folder in Explorer",
                "Sequential workflows",
              ]}
            />
            <RoadmapItem
              phase="MVP-2 · Next"
              title="Orchestration Layer"
              items={[
                "Parallel workflow execution",
                "Agent dependency graph",
                "Retry + timeout policies",
                "Conditional branching",
                "Agent output routing",
              ]}
            />
            <RoadmapItem
              phase="Phase 3 · Future"
              title="Intelligence Layer"
              items={[
                "Natural language workflow generation",
                "Agent auto-discovery via AST",
                "Cross-agent memory sharing",
                "Evaluation + benchmarking suite",
                "Plugin marketplace (local)",
              ]}
            />
          </div>
        </GlassPanel>

        {/* ── Section 9: Future NL examples ──────────────────────────────── */}
        <GlassPanel className="p-6 md:p-8 border-[#7A5AF8]/20">
          <div className="mb-4 flex items-center gap-3">
            <SectionHeader eyebrow="Future Feature" title="Natural Language Workflow Generation" />
            <Badge color="violet">FUTURE</Badge>
          </div>
          <p className="text-sm text-[#B3B7C2] mb-4 max-w-xl">
            In a future release, you will be able to describe what you want in plain English and Agent OS will generate
            a workflow automatically. These are <strong className="text-[#a68ff8]">NOT</strong> implemented yet.
          </p>
          <div className="space-y-3">
            {[
              "Research the top 5 AI stocks, generate a comparative report, and email it to me.",
              "Analyze the logs in /var/log/nginx/, identify the top 10 error patterns, and save a summary.",
              "Review all Python files in D:/projects/myapp for security vulnerabilities and produce a fix plan.",
            ].map((example, i) => (
              <div key={i} className="rounded-xl border border-[#7A5AF8]/20 bg-[#7A5AF8]/5 p-3.5">
                <p className="text-[11px] uppercase tracking-wider text-[#6E7482] mb-1.5">Example {i + 1} — FUTURE</p>
                <p className="text-sm text-[#B3B7C2] italic">&ldquo;{example}&rdquo;</p>
              </div>
            ))}
          </div>
        </GlassPanel>

        {/* ── Section 10: Call to action ──────────────────────────────────── */}
        <GlassPanel className="p-8 md:p-12 text-center overflow-hidden relative">
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{
              background:
                "radial-gradient(ellipse at 50% 0%, rgba(199,166,107,0.15), transparent 60%)",
            }}
          />
          <div className="relative z-10">
            <h2 className="text-2xl md:text-3xl font-bold text-[#F5F5F7] mb-3">
              Start With Your First Agent
            </h2>
            <p className="text-[#B3B7C2] mb-8 max-w-lg mx-auto text-sm leading-relaxed">
              Create an <code className="text-[#E2C48D] bg-[#16181D] px-1.5 py-0.5 rounded">agent.yaml</code> in your project folder,
              click <strong className="text-[#F5F5F7]">Import Agent</strong> in the registry, and run your first local agent in under 2 minutes.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/agents">
                <PrimaryButton className="px-8 py-3 text-base">
                  Open Agent Registry
                </PrimaryButton>
              </Link>
              <Link href="/workflows">
                <SecondaryButton className="px-8 py-3 text-base">
                  Browse Workflows
                </SecondaryButton>
              </Link>
            </div>
          </div>
        </GlassPanel>

      </div>
    </AppShell>
  );
}
