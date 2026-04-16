// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { PinterestAuthAdapter } from "../auth/pinterest-auth-adapter.js";
import type { RateLimiter } from "../utils/security/rate-limiter.js";
import { ReportCsvStore, SessionServiceStore } from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { PinterestHttpClient } from "./pinterest/pinterest-http-client.js";
import { PinterestService } from "./pinterest/pinterest-service.js";
import { PinterestReportingService } from "./pinterest/pinterest-reporting-service.js";

export interface SessionServices {
  pinterestService: PinterestService;
  pinterestReportingService: PinterestReportingService;
}

export interface PinterestSessionConfig {
  baseUrl: string;
  apiVersion: string;
  reportPollIntervalMs: number;
  reportMaxPollAttempts: number;
}

export function createSessionServices(
  authAdapter: PinterestAuthAdapter,
  config: PinterestSessionConfig,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const httpClient = new PinterestHttpClient(
    authAdapter,
    authAdapter.adAccountId,
    config.baseUrl,
    logger,
    config.apiVersion
  );
  const pinterestService = new PinterestService(rateLimiter, httpClient, logger);
  const pinterestReportingService = new PinterestReportingService(
    rateLimiter,
    httpClient,
    logger,
    config.reportPollIntervalMs,
    config.reportMaxPollAttempts
  );

  return {
    pinterestService,
    pinterestReportingService,
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();

/**
 * Per-process singleton for raw report CSV resources. Reads via
 * `report-csv://{id}` are not session-scoped at the MCP protocol level, so the
 * store is a module-level singleton. Sessions can opt into scoped cleanup by
 * passing their sessionId when storing.
 */
export const reportCsvStore = new ReportCsvStore();