import { randomUUID } from "crypto";

/**
 * Request context for tracking requests across services
 */
export interface RequestContext {
  requestId: string;
  userId?: string;
  timestamp: string;
  service: string;
}

/**
 * Create a new request context
 */
export function createRequestContext(service: string, userId?: string): RequestContext {
  return {
    requestId: randomUUID(),
    userId,
    timestamp: new Date().toISOString(),
    service,
  };
}

/**
 * Extract request ID from headers
 */
export function extractRequestId(headers: Record<string, string | string[] | undefined>): string {
  const requestId = headers["x-request-id"];
  if (typeof requestId === "string") {
    return requestId;
  }
  return randomUUID();
}
