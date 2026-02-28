import { randomUUID } from "crypto";
import { AsyncLocalStorage } from "async_hooks";

/**
 * Request context for tracking requests across async boundaries.
 *
 * Unified interface used by both:
 * - Transport layer (AsyncLocalStorage propagation via `runWithRequestContext`)
 * - Tool/operation layer (per-invocation context via `createOperationContext`)
 *
 * The index signature allows parent/additional context to be merged in.
 */
export interface RequestContext {
  requestId: string;
  sessionId?: string;
  userId?: string;
  timestamp: string;
  service?: string;
  operation?: string;
  [key: string]: unknown;
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

// ─── Operation-level context (formerly internal/request-context.ts) ───────

/**
 * Generate a unique request ID with `req-` prefix.
 */
export function generateRequestContextId(): string {
  return `req-${randomUUID()}`;
}

/**
 * Create a request context for tool/operation tracking.
 * Supports merging parent context and additional context fields.
 */
export function createOperationContext(params?: {
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
 * Request context service — convenience object for DI registration.
 */
export const requestContextService = {
  createOperationContext,
  generateRequestContextId,
};
