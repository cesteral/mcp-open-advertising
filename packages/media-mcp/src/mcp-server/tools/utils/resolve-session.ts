import { resolveSessionServicesFromStore } from "@cesteral/shared";
import { sessionServiceStore, type SessionServices } from "../../../services/session-services.js";
import type { SdkContext } from "../../../types-global/mcp.js";

export function resolveSessionServices(sdkContext?: SdkContext): SessionServices {
  return resolveSessionServicesFromStore(sessionServiceStore, sdkContext);
}
