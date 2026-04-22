// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Custom OpenTelemetry business metrics
 *
 * Provides pre-configured meters and instruments for tracking
 * MCP server operational metrics.
 */

import { metrics, type Counter, type Histogram, type ObservableGauge } from "@opentelemetry/api";

const METER_NAME = "cesteral-mcp";

function getMeter() {
  return metrics.getMeter(METER_NAME);
}

// ---------------------------------------------------------------------------
// Tool execution metrics
// ---------------------------------------------------------------------------

let toolExecutionCounter: Counter | undefined;
let toolExecutionDuration: Histogram | undefined;

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
      advice: {
        explicitBucketBoundaries: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000],
      },
    });
  }

  toolExecutionCounter.add(1, { tool_name: toolName, status });
  toolExecutionDuration.record(durationMs, { tool_name: toolName, status });
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
// Session rehydration metrics
// ---------------------------------------------------------------------------

let sessionRehydrationsCounter: Counter | undefined;

/**
 * Record an MCP session being rebuilt from auth headers on a Cloud Run
 * instance that had never seen the session ID (scale-out rebuild path).
 */
export function recordSessionRehydration(authType: string): void {
  if (!sessionRehydrationsCounter) {
    sessionRehydrationsCounter = getMeter().createCounter(
      "mcp_session_rehydrated_total",
      {
        description:
          "Count of MCP sessions rebuilt from auth headers on a new instance (Cloud Run scale-out rebuild path).",
        unit: "1",
      }
    );
  }
  sessionRehydrationsCounter.add(1, { auth_type: authType });
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