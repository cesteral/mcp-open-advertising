/**
 * Resolve session services from the session store using sdkContext.
 */

import { sessionServiceStore, type SessionServices } from "../../../services/session-services.js";
import type { SdkContext } from "../../../types-global/mcp.js";

/**
 * Look up the SessionServices for the current request.
 * Throws a descriptive error if the session is not found.
 */
export function resolveSessionServices(sdkContext?: SdkContext): SessionServices {
  const sessionId = sdkContext?.sessionId as string | undefined;
  if (!sessionId) {
    throw new Error(
      "No sessionId in sdkContext. Ensure the MCP server passes sessionId to tool logic."
    );
  }

  const services = sessionServiceStore.get(sessionId);
  if (!services) {
    throw new Error(
      `No session services found for sessionId "${sessionId}". The session may have expired.`
    );
  }

  return services;
}
