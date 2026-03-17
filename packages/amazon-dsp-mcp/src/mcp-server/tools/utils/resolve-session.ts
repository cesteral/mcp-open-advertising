// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Resolve session services from the session store using sdkContext.
 */

import { resolveSessionServicesFromStore } from "@cesteral/shared";
import { sessionServiceStore, type SessionServices } from "../../../services/session-services.js";
import type { SdkContext } from "@cesteral/shared";

/**
 * Look up the SessionServices for the current request.
 * Throws a descriptive error if the session is not found.
 */
export function resolveSessionServices(sdkContext?: SdkContext): SessionServices {
  return resolveSessionServicesFromStore(sessionServiceStore, sdkContext);
}