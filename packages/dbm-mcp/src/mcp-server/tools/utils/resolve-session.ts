/**
 * Resolve session services from the session store using sdkContext.
 */

import { sessionServiceStore, type SessionServices } from "../../../services/session-services.js";
import { McpError, JsonRpcErrorCode } from "../../../utils/errors/index.js";
import type { SdkContext } from "../../../types-global/mcp.js";

/**
 * Look up the SessionServices for the current request.
 * Throws a descriptive error if the session is not found.
 */
export function resolveSessionServices(sdkContext?: SdkContext): SessionServices {
  const sessionId = sdkContext?.sessionId as string | undefined;
  if (!sessionId) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      "No session ID available. Credentials must be provided via HTTP headers at connection time.",
      {}
    );
  }

  const services = sessionServiceStore.get(sessionId);
  if (!services) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `No services registered for session "${sessionId}". The session may have expired or credentials were not provided.`,
      { sessionId }
    );
  }

  return services;
}
