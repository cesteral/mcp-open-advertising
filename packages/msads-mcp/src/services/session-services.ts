// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { RateLimiter } from "@cesteral/shared";
import { ReportCsvStore, SessionServiceStore } from "@cesteral/shared";
import type { MsAdsAuthAdapter } from "../auth/msads-auth-adapter.js";
import { MsAdsHttpClient } from "./msads/msads-http-client.js";
import { MsAdsService } from "./msads/msads-service.js";
import { MsAdsReportingService } from "./msads/msads-reporting-service.js";

export interface SessionServices {
  msadsService: MsAdsService;
  msadsCustomerService: MsAdsService;
  msadsReportingService: MsAdsReportingService;
}

export interface MsAdsSessionConfig {
  campaignApiBaseUrl: string;
  reportingApiBaseUrl: string;
  customerApiBaseUrl: string;
  reportPollIntervalMs: number;
  reportMaxPollAttempts: number;
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();

/**
 * Per-process store for raw report CSV bodies that `msads_download_report`
 * persists on demand (via `storeRawCsv: true`). Served through the
 * `report-csv://{id}` MCP resource template. Entries expire after 30 minutes.
 */
export const reportCsvStore = new ReportCsvStore();

export function createSessionServices(
  authAdapter: MsAdsAuthAdapter,
  config: MsAdsSessionConfig,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const campaignClient = new MsAdsHttpClient(authAdapter, config.campaignApiBaseUrl, logger);
  const reportingClient = new MsAdsHttpClient(authAdapter, config.reportingApiBaseUrl, logger);
  const customerClient = new MsAdsHttpClient(authAdapter, config.customerApiBaseUrl, logger);

  const msadsService = new MsAdsService(rateLimiter, campaignClient, logger);
  const msadsCustomerService = new MsAdsService(rateLimiter, customerClient, logger);
  const msadsReportingService = new MsAdsReportingService(
    rateLimiter,
    reportingClient,
    logger,
    config.reportMaxPollAttempts
  );

  return { msadsService, msadsCustomerService, msadsReportingService };
}