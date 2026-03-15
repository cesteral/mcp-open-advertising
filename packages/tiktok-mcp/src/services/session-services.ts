// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { TikTokAuthAdapter } from "../auth/tiktok-auth-adapter.js";
import type { RateLimiter } from "../utils/security/rate-limiter.js";
import { SessionServiceStore } from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { TikTokHttpClient } from "./tiktok/tiktok-http-client.js";
import { TikTokService } from "./tiktok/tiktok-service.js";
import { TikTokReportingService } from "./tiktok/tiktok-reporting-service.js";

export interface SessionServices {
  tiktokService: TikTokService;
  tiktokReportingService: TikTokReportingService;
}

export interface TikTokSessionConfig {
  baseUrl: string;
  reportPollIntervalMs: number;
  reportMaxPollAttempts: number;
}

export function createSessionServices(
  authAdapter: TikTokAuthAdapter,
  config: TikTokSessionConfig,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const httpClient = new TikTokHttpClient(
    authAdapter,
    authAdapter.advertiserId,
    config.baseUrl,
    logger
  );
  const tiktokService = new TikTokService(rateLimiter, httpClient, logger);
  const tiktokReportingService = new TikTokReportingService(
    rateLimiter,
    httpClient,
    logger,
    config.reportPollIntervalMs,
    config.reportMaxPollAttempts
  );

  return {
    tiktokService,
    tiktokReportingService,
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();