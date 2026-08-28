/**
 * Structured Logger Service
 *
 * Lightweight, zero-dependency JSON operational logger.
 * Emits single-line JSON logs to standard output/error.
 */

export interface LogContext {
  executionId?: string;
  agentId?: string;
  durationMs?: number;
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface StructuredLogPayload {
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR";
  event: string;
  message: string;
  executionId?: string;
  agentId?: string;
  durationMs?: number;
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

function writeLog(
  level: "INFO" | "WARN" | "ERROR",
  event: string,
  message: string,
  context?: LogContext
): void {
  const payload: StructuredLogPayload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    message,
  };

  if (context) {
    if (context.executionId !== undefined) payload.executionId = context.executionId;
    if (context.agentId !== undefined) payload.agentId = context.agentId;
    if (context.durationMs !== undefined) payload.durationMs = context.durationMs;
    if (context.details !== undefined) payload.details = context.details;

    // Explicitly copy any additional primitive/simple context key-values passed by caller
    for (const [key, val] of Object.entries(context)) {
      if (!["executionId", "agentId", "durationMs", "details"].includes(key) && val !== undefined) {
        payload[key] = val;
      }
    }
  }

  const jsonStr = JSON.stringify(payload);

  if (level === "ERROR") {
    console.error(jsonStr);
  } else if (level === "WARN") {
    console.warn(jsonStr);
  } else {
    console.log(jsonStr);
  }
}

export const logger = {
  info(event: string, message: string, context?: LogContext): void {
    writeLog("INFO", event, message, context);
  },

  warn(event: string, message: string, context?: LogContext): void {
    writeLog("WARN", event, message, context);
  },

  error(event: string, message: string, context?: LogContext): void {
    writeLog("ERROR", event, message, context);
  },
};
