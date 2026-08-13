import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = 8080;
const GATEWAY_URL = `http://localhost:${PORT}`;

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3 || args[0] !== "workflow" || args[1] !== "run") {
    console.error("Usage: aw workflow run <workflow-id> --goal \"<goal>\"");
    process.exit(1);
  }

  const workflowId = args[2];
  let goal = "";
  for (let i = 3; i < args.length; i++) {
    if (args[i] === "--goal" && i + 1 < args.length) {
      goal = args[i + 1];
      break;
    }
  }

  if (!goal) {
    console.error("Error: --goal parameter is required.");
    process.exit(1);
  }

  console.log(`Sending goal to Gateway: "${goal}"`);

  // Start workflow run via POST request
  let runId = "";
  try {
    const postData = JSON.stringify({ goal });
    const options = {
      hostname: "localhost",
      port: PORT,
      path: `/api/workflows/${workflowId}/run`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let body = "";
      res.setEncoding("utf-8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          const data = JSON.parse(body);
          if (res.statusCode !== 202) {
            console.error(`Error starting workflow: ${data.error || "Unknown error"}`);
            process.exit(1);
          }
          runId = data.runId;
          console.log(`🚀 Workflow run started: ${runId}\n`);
          connectToSse(runId);
        } catch (e: any) {
          console.error(`Failed to parse response body: ${e.message}`);
          process.exit(1);
        }
      });
    });

    req.on("error", (err) => {
      console.error(`Failed to connect to gateway at ${GATEWAY_URL}: ${err.message}`);
      console.error("Please ensure the gateway server is running (npm run dev).");
      process.exit(1);
    });

    req.write(postData);
    req.end();
  } catch (err: any) {
    console.error(`Request setup failed: ${err.message}`);
    process.exit(1);
  }
}

function connectToSse(runId: string) {
  const options = {
    hostname: "localhost",
    port: PORT,
    path: `/api/workflow-runs/${runId}/stream`,
    method: "GET",
  };

  const req = http.get(options, (res) => {
    let buffer = "";

    res.on("data", (chunk) => {
      buffer += chunk.toString();
      const events = buffer.split("\n\n");
      // Keep the last partial event in the buffer
      buffer = events.pop() ?? "";

      for (const rawEvent of events) {
        if (!rawEvent.trim()) continue;
        const lines = rawEvent.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.substring(6));
              handleEvent(event);
            } catch (e) {
              // Ignore malformed JSON
            }
          }
        }
      }
    });

    res.on("end", () => {
      console.log("\nSummary of files in workspace:");
      printSummary(runId);
      process.exit(0);
    });
  });

  req.on("error", (err) => {
    console.error(`SSE stream connection failed: ${err.message}`);
    process.exit(1);
  });
}

function handleEvent(event: any) {
  const { type, data } = event;
  switch (type) {
    case "workflow_started":
      console.log(`[Workflow] Started execution of '${data.workflowId}'`);
      break;
    case "step_started":
      console.log(`\n  ➔ Step [${data.stepId}] is running using agent '${data.agentId}'...`);
      break;
    case "step_log":
      // Print thinking logs indented
      console.log(`      [${data.stepId}] ${data.log}`);
      break;
    case "step_completed":
      console.log(`  ✔ Step [${data.stepId}] completed successfully.`);
      break;
    case "step_failed":
      console.error(`  ❌ Step [${data.stepId}] failed. Error: ${data.error}`);
      break;
    case "workflow_completed":
      console.log(`\n🎉 Workflow completed successfully!`);
      break;
    case "workflow_failed":
      console.error(`\n❌ Workflow failed! Error: ${data.error}`);
      process.exit(1);
      break;
    case "workflow_cancelled":
      console.log(`\n⚠️ Workflow run was cancelled.`);
      process.exit(0);
      break;
  }
}

function printSummary(runId: string) {
  const runDir = path.resolve(process.cwd(), "data", "executions", runId);
  console.log(`Workspace Path: file:///${runDir.replace(/\\/g, "/")}`);
  
  if (fs.existsSync(runDir)) {
    const listDirRecursive = (dir: string, indent = " ") => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === "workflow_state.json" || entry.name === "input.json" || entry.name === "logs") {
          continue;
        }
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          console.log(`${indent} - ${entry.name}/`);
          listDirRecursive(fullPath, indent + "   ");
        } else {
          const stats = fs.statSync(fullPath);
          const sizeKb = (stats.size / 1024).toFixed(1);
          console.log(`${indent} - ${entry.name} (${sizeKb} KB)`);
        }
      }
    };
    listDirRecursive(runDir);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
