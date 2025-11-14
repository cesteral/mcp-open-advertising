import { randomUUID } from "crypto";

/**
 * Request context for tracking operations through the system
 * Propagated through all service calls for logging and tracing
 */
export interface RequestContext {
  requestId: string; // Unique ID for correlation
  timestamp: string; // ISO 8601
  tenantId?: string; // Multi-tenancy support
  traceId?: string; // OpenTelemetry trace ID
  spanId?: string; // OpenTelemetry span ID
  operation?: string; // Operation name (e.g., "HandleToolRequest")
  [key: string]: unknown; // Extensible for additional context
}

/**
 * Generate a unique request ID
 */
export function generateRequestContextId(): string {
  return `req-${randomUUID()}`;
}

/**
 * Create a new request context
 */
export function createRequestContext(params?: {
  parentContext?: Record<string, unknown>;
  additionalContext?: Record<string, unknown>;
  operation?: string;
}): RequestContext {
  const requestId =
    (params?.parentContext?.requestId as string) ?? generateRequestContextId();

  return {
    requestId,
    timestamp: new Date().toISOString(),
    ...params?.parentContext,
    ...params?.additionalContext,
    operation: params?.operation,
  };
}

/**
 * Request context service
 */
export const requestContextService = {
  createRequestContext,
  generateRequestContextId,
};
