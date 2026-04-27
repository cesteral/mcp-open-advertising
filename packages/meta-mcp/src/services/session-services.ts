// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { MetaAuthAdapter } from "../auth/meta-auth-adapter.js";
import type { RateLimiter } from "../utils/security/rate-limiter.js";
import { SessionServiceStore } from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { MetaGraphApiClient } from "./meta/meta-graph-api-client.js";
import { MetaService } from "./meta/meta-service.js";
import { MetaInsightsService } from "./meta/meta-insights-service.js";
import { MetaTargetingService } from "./meta/meta-targeting-service.js";

export interface MetaSessionConfig {
  baseUrl: string;
}

export interface SessionServices {
  metaService: MetaService;
  metaInsightsService: MetaInsightsService;
  metaTargetingService: MetaTargetingService;
}

export function createSessionServices(
  authAdapter: MetaAuthAdapter,
  config: MetaSessionConfig,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const httpClient = new MetaGraphApiClient(authAdapter, config.baseUrl, logger);
  const metaService = new MetaService(rateLimiter, httpClient, logger);
  const metaInsightsService = new MetaInsightsService(rateLimiter, httpClient, logger);
  const metaTargetingService = new MetaTargetingService(rateLimiter, httpClient, logger);
  return {
    metaService,
    metaInsightsService,
    metaTargetingService,
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();
