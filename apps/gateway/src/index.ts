import "dotenv/config";
import express from "express";
import cors from "cors";
import { agentsRouter } from "./routes/agents.js";
import { executionsRouter } from "./routes/executions.js";
import { workflowsRouter } from "./routes/workflows.js";
import { registryRouter } from "./routes/registry.js";
import { shellRouter } from "./routes/shell.js";
import { secretsRouter } from "./routes/secrets.js";
import { runtimesRouter } from "./routes/runtimes.js";
import { registryService } from "./services/registry.service.js";
import { storeRepository } from "./repositories/index.js";
import { runHistoricalMigration } from "./repositories/migrate.js";
import { secretsService } from "./services/secrets.service.js";
import { runtimeService } from "./services/runtime.service.js";
import { processService } from "./services/process.service.js";
import { workflowsEngine } from "./workflows/engine.js";

const PORT = parseInt(process.env["PORT"] ?? "8080", 10);
const VERSION = "2.0.0";

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Routes
app.use("/api/agents", agentsRouter);
app.use("/api", executionsRouter);
app.use("/api", workflowsRouter);
app.use("/api/registry", registryRouter);
app.use("/api/shell", shellRouter);
app.use("/api/secrets", secretsRouter);
app.use("/api", runtimesRouter);

// GEMINI_API_KEY Startup Warning
if (!process.env["GEMINI_API_KEY"] && !secretsService.getSecret("GEMINI_API_KEY")) {
  console.warn("\x1b[33m⚠️ WARNING: GEMINI_API_KEY is not set. Gemini-dependent agents may fail at runtime.\x1b[0m");
}

// Health check handler (exposed on both /health and /api/health)
const handleHealth = async (_req: express.Request, res: express.Response) => {
  const agents = registryService.listAgents();
  const psAvailable = await processService.checkPsAvailable();
  res.json({
    status: "ok",
    service: "agent-workspace-gateway",
    version: VERSION,
    port: PORT,
    agentsDiscovered: agents.length,
    agentIds: agents.map((a) => a.id),
    capabilities: {
      psAvailable,
    },
  });
};

app.get("/health", handleHealth);
app.get("/api/health", handleHealth);

// 404 catch-all
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// Boot sequence: initialize persistence, secrets, runtimes, then load registry
async function boot() {
  // Run historical data migration to SQLite if needed
  await runHistoricalMigration();
  
  await storeRepository.init();
  secretsService.init();
  runtimeService.init();
  await registryService.load();
  workflowsEngine.load();
  const psAvailable = await processService.checkPsAvailable();
  console.log(`[system] System capabilities: psAvailable=${psAvailable}`);

  // Start server
  app.listen(PORT, () => {
    console.log(`\n🚀 Agent Workspace Gateway v${VERSION}`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`   Health:    http://localhost:${PORT}/health & http://localhost:${PORT}/api/health`);
    console.log(`   Agents:    http://localhost:${PORT}/api/agents`);
    console.log(`   Executions:http://localhost:${PORT}/api/executions`);
    console.log(`   Registry:  http://localhost:${PORT}/api/registry`);
    console.log(`   Shell:     http://localhost:${PORT}/api/shell`);
    console.log();
  });
}

boot().catch((err) => {
  console.error("Fatal boot error:", err);
  process.exit(1);
});
