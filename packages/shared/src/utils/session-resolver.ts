/**
 * Generic session resolver helper
 *
 * Eliminates the duplicated resolveSessionServices() boilerplate across all
 * MCP server packages. Each package wraps this with its own SessionServices type.
 */

import { SessionServiceStore } from "./session-store.js";
import { McpError, JsonRpcErrorCode } from "./mcp-errors.js";

/** Minimal context shape — compatible with both per-package SdkContext and shared ToolSdkContext. */
interface SessionContext {
  sessionId?: string;
  [key: string]: unknown;
}

/**
 * Look up typed session services from a SessionServiceStore using sdkContext.
 * Throws a descriptive McpError if the session ID is missing or unknown.
 */
export function resolveSessionServicesFromStore<T>(
  store: SessionServiceStore<T>,
  sdkContext?: SessionContext
): T {
  const sessionId = sdkContext?.sessionId as string | undefined;

  if (!sessionId) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      "No session ID available. Credentials must be provided via HTTP headers at connection time.",
      {}
    );
  }

  const services = store.get(sessionId);

  if (!services) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `No services registered for session "${sessionId}". The session may have expired or credentials were not provided.`,
      { sessionId }
    );
  }

  return services;
}
