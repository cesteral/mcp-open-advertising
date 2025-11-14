/**
 * Tracing utilities for creating custom spans
 *
 * Provides helper functions to create and manage OpenTelemetry spans
 * for tool execution, service calls, and other operations.
 */

import { trace, context, SpanStatusCode, Span, Tracer } from "@opentelemetry/api";
import type { Logger } from "pino";

/**
 * Get the global tracer instance
 *
 * @param name - Tracer name (typically service or module name)
 * @returns Tracer instance
 */
export function getTracer(name: string = "dv360-mcp"): Tracer {
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
    "tool.input.entityType": input.entityType || "unknown",
  };

  // Add specific attributes based on input
  if (input.advertiserId) {
    attributes["tool.input.advertiserId"] = input.advertiserId;
  }
  if (input.campaignId) {
    attributes["tool.input.campaignId"] = input.campaignId;
  }
  if (input.lineItemId) {
    attributes["tool.input.lineItemId"] = input.lineItemId;
  }

  return withSpan(`tool.${toolName}`, fn, attributes);
}

/**
 * Create a span for DV360 API calls
 *
 * @param operation - API operation (e.g., "listEntities", "updateEntity")
 * @param entityType - Entity type being operated on
 * @param fn - API call function
 * @returns API call result
 */
export async function withDV360ApiSpan<T>(
  operation: string,
  entityType: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const attributes = {
    "dv360.operation": operation,
    "dv360.entityType": entityType,
  };

  return withSpan(`dv360.${operation}`, fn, attributes);
}

/**
 * Add event to current span
 *
 * @param name - Event name
 * @param attributes - Event attributes
 */
export function addSpanEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
  const currentSpan = trace.getActiveSpan();
  if (currentSpan) {
    currentSpan.addEvent(name, attributes);
  }
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

/**
 * Get current span context for propagation
 *
 * @returns Current span or undefined
 */
export function getCurrentSpan(): Span | undefined {
  return trace.getActiveSpan();
}

/**
 * Create a child span from current context
 *
 * @param spanName - Name of the child span
 * @param attributes - Optional span attributes
 * @returns Span instance
 */
export function createChildSpan(spanName: string, attributes?: Record<string, string | number | boolean>): Span {
  const tracer = getTracer();
  const span = tracer.startSpan(spanName);

  if (attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, value);
    });
  }

  return span;
}

/**
 * Wrap a logger with span context
 *
 * Adds trace ID and span ID to log entries
 *
 * @param logger - Pino logger instance
 * @returns Child logger with trace context
 */
export function withTraceContext(logger: Logger): Logger {
  const currentSpan = trace.getActiveSpan();
  if (!currentSpan) {
    return logger;
  }

  const spanContext = currentSpan.spanContext();
  return logger.child({
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    traceFlags: spanContext.traceFlags,
  });
}
