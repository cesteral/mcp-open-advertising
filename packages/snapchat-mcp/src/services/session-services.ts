// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { SnapchatAuthAdapter } from "../auth/snapchat-auth-adapter.js";
import type { RateLimiter } from "../utils/security/rate-limiter.js";
import { SessionServiceStore } from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { SnapchatHttpClient } from "./snapchat/snapchat-http-client.js";
import { SnapchatService } from "./snapchat/snapchat-service.js";
import { SnapchatReportingService } from "./snapchat/snapchat-reporting-service.js";

export interface SessionServices {
  snapchatService: SnapchatService;
  snapchatReportingService: SnapchatReportingService;
}

export interface SnapchatSessionConfig {
  baseUrl: string;
  reportPollIntervalMs: number;
  reportMaxPollAttempts: number;
}

export function createSessionServices(
  authAdapter: SnapchatAuthAdapter,
  config: SnapchatSessionConfig,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const httpClient = new SnapchatHttpClient(
    authAdapter,
    config.baseUrl,
    logger
  );
  const snapchatService = new SnapchatService(
    httpClient,
    authAdapter.orgId,
    authAdapter.adAccountId
  );
  const snapchatReportingService = new SnapchatReportingService(
    rateLimiter,
    httpClient,
    authAdapter.adAccountId,
    logger,
    config.reportPollIntervalMs,
    config.reportMaxPollAttempts
  );

  return {
    snapchatService,
    snapchatReportingService,
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();