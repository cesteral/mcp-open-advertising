/**
 * Custom OpenTelemetry business metrics
 *
 * Provides pre-configured meters and instruments for tracking
 * MCP server operational metrics.
 */

import { metrics, type Counter, type Histogram, type ObservableGauge } from "@opentelemetry/api";
import { EvaluatorIssueClass } from "./mcp-errors.js";

const METER_NAME = "bidshifter-mcp";

function getMeter() {
  return metrics.getMeter(METER_NAME);
}

// ---------------------------------------------------------------------------
// Tool execution metrics
// ---------------------------------------------------------------------------

let toolExecutionCounter: Counter | undefined;
let toolExecutionDuration: Histogram | undefined;
let evaluatorFindingCounter: Counter | undefined;
let workflowCallDepthHistogram: Histogram | undefined;

/**
 * Record a tool execution with status and duration.
 */
export function recordToolExecution(
  toolName: string,
  status: "success" | "error",
  durationMs: number
): void {
  if (!toolExecutionCounter) {
    toolExecutionCounter = getMeter().createCounter("mcp.tool.execution.count", {
      description: "Number of MCP tool executions",
      unit: "1",
    });
  }
  if (!toolExecutionDuration) {
    toolExecutionDuration = getMeter().createHistogram("mcp.tool.execution.duration_ms", {
      description: "Duration of MCP tool executions in milliseconds",
      unit: "ms",
    });
  }

  toolExecutionCounter.add(1, { tool_name: toolName, status });
  toolExecutionDuration.record(durationMs, { tool_name: toolName, status });
}

/**
 * Record a standardized evaluator finding.
 */
export function recordEvaluatorFinding(
  toolName: string,
  issueClass: EvaluatorIssueClass,
  isRecoverable: boolean
): void {
  if (!evaluatorFindingCounter) {
    evaluatorFindingCounter = getMeter().createCounter("mcp.evaluator.finding.count", {
      description: "Number of evaluator findings emitted by tool execution",
      unit: "1",
    });
  }

  evaluatorFindingCounter.add(1, {
    tool_name: toolName,
    issue_class: issueClass,
    is_recoverable: String(isRecoverable),
  });
}

/**
 * Record workflow call depth for efficiency tracking.
 */
export function recordWorkflowCallDepth(workflowId: string | undefined, callDepth: number): void {
  if (!workflowId) {
    return;
  }

  if (!workflowCallDepthHistogram) {
    workflowCallDepthHistogram = getMeter().createHistogram("mcp.workflow.call_depth", {
      description: "Depth of tool calls per workflow execution",
      unit: "1",
    });
  }

  workflowCallDepthHistogram.record(callDepth, { workflow_id: workflowId });
}

// ---------------------------------------------------------------------------
// Session metrics
// ---------------------------------------------------------------------------

/**
 * Register an observable gauge that tracks the current number of active sessions.
 * Call this once at server startup, passing a function that returns the current count.
 */
export function registerActiveSessionsGauge(
  getSessionCount: () => number
): ObservableGauge {
  const gauge = getMeter().createObservableGauge("mcp.session.active", {
    description: "Number of active MCP sessions",
    unit: "1",
  });
  gauge.addCallback((result) => {
    result.observe(getSessionCount());
  });
  return gauge;
}

// ---------------------------------------------------------------------------
// Auth validation metrics
// ---------------------------------------------------------------------------

let authValidationCounter: Counter | undefined;

/**
 * Record an authentication validation attempt.
 */
export function recordAuthValidation(
  authType: string,
  result: "success" | "failure"
): void {
  if (!authValidationCounter) {
    authValidationCounter = getMeter().createCounter("mcp.auth.validation.count", {
      description: "Number of authentication validation attempts",
      unit: "1",
    });
  }
  authValidationCounter.add(1, { auth_type: authType, result });
}

// ---------------------------------------------------------------------------
// Rate limit metrics
// ---------------------------------------------------------------------------

let rateLimitHitCounter: Counter | undefined;

/**
 * Record a rate limit hit.
 */
export function recordRateLimitHit(keyPattern: string): void {
  if (!rateLimitHitCounter) {
    rateLimitHitCounter = getMeter().createCounter("mcp.rate_limit.hit.count", {
      description: "Number of rate limit hits",
      unit: "1",
    });
  }
  rateLimitHitCounter.add(1, { key_pattern: keyPattern });
}
