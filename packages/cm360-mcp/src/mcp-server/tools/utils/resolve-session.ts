// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { resolveSessionServicesFromStore } from "@cesteral/shared";
import { sessionServiceStore, type SessionServices } from "../../../services/session-services.js";
import type { SdkContext } from "@cesteral/shared";

export function resolveSessionServices(sdkContext?: SdkContext): SessionServices {
  return resolveSessionServicesFromStore(sessionServiceStore, sdkContext);
}
