/**
 * Metrics Service
 *
 * Lightweight, zero-dependency, process-local in-memory metrics collector.
 */

export interface MetricsSnapshot {
  executions_total: number;
  executions_active: number;
  executions_completed: number;
  executions_failed: number;
  executions_cancelled: number;
  executions_timeout: number;
  execution_duration_avg_ms: number;
  runtime_setup_duration_avg_ms: number;
  execution_duration_ms_total: number;
  execution_duration_ms_count: number;
  runtime_setup_duration_ms_total: number;
  runtime_setup_duration_ms_count: number;
}

class MetricsService {
  private executionsTotal = 0;
  private executionsActive = 0;
  private executionsCompleted = 0;
  private executionsFailed = 0;
  private executionsCancelled = 0;
  private executionsTimeout = 0;

  private executionDurationMsTotal = 0;
  private executionDurationMsCount = 0;

  private runtimeSetupDurationMsTotal = 0;
  private runtimeSetupDurationMsCount = 0;

  /**
   * Reset all counters to zero (used in unit tests).
   */
  resetMetrics(): void {
    this.executionsTotal = 0;
    this.executionsActive = 0;
    this.executionsCompleted = 0;
    this.executionsFailed = 0;
    this.executionsCancelled = 0;
    this.executionsTimeout = 0;
    this.executionDurationMsTotal = 0;
    this.executionDurationMsCount = 0;
    this.runtimeSetupDurationMsTotal = 0;
    this.runtimeSetupDurationMsCount = 0;
  }

  /**
   * Called when an execution is created / dispatched.
   */
  recordExecutionStart(): void {
    this.executionsTotal++;
    this.executionsActive++;
  }

  /**
   * Called when runtime environment resolution finishes.
   */
  recordRuntimeSetup(durationMs: number): void {
    if (typeof durationMs !== "number" || !isFinite(durationMs) || durationMs < 0) {
      return;
    }
    this.runtimeSetupDurationMsTotal += durationMs;
    this.runtimeSetupDurationMsCount++;
  }

  /**
   * Called when an execution reaches a terminal status in handleTerminal().
   */
  recordExecutionTerminal(status: string, durationMs?: number): void {
    this.executionsActive = Math.max(0, this.executionsActive - 1);

    if (status === "completed") {
      this.executionsCompleted++;
    } else if (status === "failed") {
      this.executionsFailed++;
    } else if (status === "cancelled") {
      this.executionsCancelled++;
    } else if (status === "timeout") {
      this.executionsTimeout++;
    }

    if (typeof durationMs === "number" && isFinite(durationMs) && durationMs >= 0) {
      this.executionDurationMsTotal += durationMs;
      this.executionDurationMsCount++;
    }
  }

  /**
   * Expose current metrics snapshot and derived averages.
   */
  getMetrics(): MetricsSnapshot {
    const executionDurationAvgMs =
      this.executionDurationMsCount > 0
        ? Number((this.executionDurationMsTotal / this.executionDurationMsCount).toFixed(2))
        : 0;

    const runtimeSetupDurationAvgMs =
      this.runtimeSetupDurationMsCount > 0
        ? Number((this.runtimeSetupDurationMsTotal / this.runtimeSetupDurationMsCount).toFixed(2))
        : 0;

    return {
      executions_total: this.executionsTotal,
      executions_active: this.executionsActive,
      executions_completed: this.executionsCompleted,
      executions_failed: this.executionsFailed,
      executions_cancelled: this.executionsCancelled,
      executions_timeout: this.executionsTimeout,
      execution_duration_avg_ms: executionDurationAvgMs,
      runtime_setup_duration_avg_ms: runtimeSetupDurationAvgMs,
      execution_duration_ms_total: this.executionDurationMsTotal,
      execution_duration_ms_count: this.executionDurationMsCount,
      runtime_setup_duration_ms_total: this.runtimeSetupDurationMsTotal,
      runtime_setup_duration_ms_count: this.runtimeSetupDurationMsCount,
    };
  }
}

export const metricsService = new MetricsService();
