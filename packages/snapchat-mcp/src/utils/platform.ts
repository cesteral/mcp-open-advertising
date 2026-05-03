// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { createPlatformSpanHelper, createPlatformRateLimiter } from "@cesteral/shared";
import { mcpConfig } from "../config/index.js";

export const withSnapchatApiSpan = createPlatformSpanHelper("snapchat");
export const rateLimiter = createPlatformRateLimiter("snapchat", mcpConfig.snapchatRateLimitPerMinute);
