import { randomUUID } from "crypto";
import { AsyncLocalStorage } from "async_hooks";

/**
 * Request context for tracking requests across async boundaries.
 *
 * Uses AsyncLocalStorage so any code in the call chain can access the
 * current requestId without explicit parameter passing.
 */
export interface RequestContext {
  requestId: string;
  sessionId?: string;
  userId?: string;
  timestamp: string;
  service: string;
}

/**
 * AsyncLocalStorage instance for propagating RequestContext
 * across the full request lifecycle: transport → server → tool → service → API call.
 */
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

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
 * Run a function within a request context.
 * All async code within `fn` can access the context via `getRequestContext()`.
 */
export function runWithRequestContext<T>(
  ctx: RequestContext,
  fn: () => T
): T {
  return requestContextStorage.run(ctx, fn);
}

/**
 * Get the current request context (if any).
 * Returns undefined if called outside of a `runWithRequestContext` scope.
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

/**
 * Get the current request ID, falling back to "unknown" if not in a request context.
 */
export function getRequestId(): string {
  return requestContextStorage.getStore()?.requestId ?? "unknown";
}

/**
 * Extract request ID from headers, falling back to a new UUID.
 */
export function extractRequestId(headers: Record<string, string | string[] | undefined>): string {
  const requestId = headers["x-request-id"];
  if (typeof requestId === "string") {
    return requestId;
  }
  return randomUUID();
}
