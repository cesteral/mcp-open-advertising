/**
 * Tracing utilities for creating custom spans
 *
 * Provides helper functions to create and manage OpenTelemetry spans
 * for tool execution, service calls, and other operations.
 */

import { trace, context, SpanStatusCode, Span, Tracer } from "@opentelemetry/api";

/**
 * Get the global tracer instance
 *
 * @param name - Tracer name (typically service or module name)
 * @returns Tracer instance
 */
export function getTracer(name: string = "dbm-mcp"): Tracer {
  return trace.getTracer(name);
}

/**
 * Create a span and execute a function within its context
 *
 * @param spanName - Name of the span
 * @param fn - Function to execute within the span
 * @param attributes - Optional span attributes
 * @returns Result of the function
 */
export async function withSpan<T>(
  spanName: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const tracer = getTracer();
  const span = tracer.startSpan(spanName);

  // Add custom attributes
  if (attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, value);
    });
  }

  try {
    // Execute function within span context
    const result = await context.with(trace.setSpan(context.active(), span), () => fn(span));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error: any) {
    // Record exception and set error status
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message || String(error),
    });
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Create a span for tool execution
 *
 * @param toolName - Name of the tool being executed
 * @param input - Tool input parameters
 * @param fn - Tool execution function
 * @returns Tool execution result
 */
export async function withToolSpan<T>(
  toolName: string,
  input: Record<string, any>,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const attributes: Record<string, string | number | boolean> = {
    "tool.name": toolName,
  };

  // Add specific attributes based on input
  if (input.advertiserId) {
    attributes["tool.input.advertiserId"] = input.advertiserId;
  }
  if (input.campaignId) {
    attributes["tool.input.campaignId"] = input.campaignId;
  }
  if (input.startDate) {
    attributes["tool.input.startDate"] = input.startDate;
  }
  if (input.endDate) {
    attributes["tool.input.endDate"] = input.endDate;
  }

  return withSpan(`tool.${toolName}`, fn, attributes);
}

/**
 * Create a span for Bid Manager API calls
 *
 * @param operation - API operation (e.g., "createQuery", "runQuery", "fetchReport")
 * @param queryId - Query ID (if available)
 * @param fn - API call function
 * @returns API call result
 */
export async function withBidManagerApiSpan<T>(
  operation: string,
  queryId: string | undefined,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const attributes: Record<string, string | number | boolean> = {
    "bidmanager.operation": operation,
  };

  if (queryId) {
    attributes["bidmanager.queryId"] = queryId;
  }

  return withSpan(`bidmanager.${operation}`, fn, attributes);
}

/**
 * Set attribute on current span
 *
 * @param key - Attribute key
 * @param value - Attribute value
 */
export function setSpanAttribute(key: string, value: string | number | boolean): void {
  const currentSpan = trace.getActiveSpan();
  if (currentSpan) {
    currentSpan.setAttribute(key, value);
  }
}

/**
 * Record error on current span
 *
 * @param error - Error to record
 */
export function recordSpanError(error: Error): void {
  const currentSpan = trace.getActiveSpan();
  if (currentSpan) {
    currentSpan.recordException(error);
    currentSpan.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
  }
}
