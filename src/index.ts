import "dotenv/config";
import express from "express";
import cors from "cors";
import { agentsRouter } from "./routes/agents.js";
import { executionsRouter } from "./routes/executions.js";
import { storeService } from "./services/store.service.js";

const PORT = parseInt(process.env["PORT"] ?? "8080", 10);

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Routes
app.use("/api/agents", agentsRouter);
app.use("/api", executionsRouter);

// Root health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "agent-dashboard-gateway", port: PORT });
});

// 404 catch-all
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// Initialize persistence layer
storeService.init();

// Start server
app.listen(PORT, () => {
  console.log(`Agent Dashboard Gateway running on http://localhost:${PORT}`);
  console.log(`Health:  http://localhost:${PORT}/health`);
  console.log(`Agents:  http://localhost:${PORT}/api/agents`);
});
