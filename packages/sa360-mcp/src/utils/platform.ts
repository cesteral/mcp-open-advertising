// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import {
  createPlatformSpanHelper,
  createPlatformRateLimiter,
  PLATFORM_RATE_LIMIT_WINDOW_MS,
  PLATFORM_RATE_LIMIT_MAX_WAIT_MS,
} from "@cesteral/shared";
import { mcpConfig } from "../config/index.js";

export const withSA360ApiSpan = createPlatformSpanHelper("sa360");
export const rateLimiter = createPlatformRateLimiter("sa360", mcpConfig.sa360RateLimitPerMinute);

// v2 (DoubleClick Search) calls consume `sa360:v2:*` keys. The limiter applies
// the most specific matching pattern, so this limit — not `sa360:*` — governs
// them. See sa360V2RateLimitPerMinute in config for why they are separate.
rateLimiter.configure(
  "sa360:v2:*",
  mcpConfig.sa360V2RateLimitPerMinute,
  PLATFORM_RATE_LIMIT_WINDOW_MS,
  { maxWaitMs: PLATFORM_RATE_LIMIT_MAX_WAIT_MS }
);
