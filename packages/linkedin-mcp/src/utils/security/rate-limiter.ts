// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

export { RateLimiter } from "@cesteral/shared";
import { createPlatformRateLimiter } from "@cesteral/shared";
import { mcpConfig } from "../../config/index.js";

export const rateLimiter = createPlatformRateLimiter("linkedin", mcpConfig.linkedinRateLimitPerMinute);