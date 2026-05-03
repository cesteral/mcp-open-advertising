// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { TikTokAuthAdapter } from "../auth/tiktok-auth-adapter.js";
import type { RateLimiter } from "@cesteral/shared";
import {
  deleteSpilledObjectsForSession,
  ReportCsvStore,
  SessionServiceStore,
} from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { TikTokHttpClient } from "./tiktok/tiktok-http-client.js";
import { TikTokService } from "./tiktok/tiktok-service.js";
import { TikTokReportingService } from "./tiktok/tiktok-reporting-service.js";
import { setApiVersion } from "../mcp-server/tools/utils/entity-mapping.js";

export interface SessionServices {
  tiktokService: TikTokService;
  tiktokReportingService: TikTokReportingService;
}

export interface TikTokSessionConfig {
  baseUrl: string;
  reportPollIntervalMs: number;
  reportMaxPollAttempts: number;
  apiVersion: string;
}

export function createSessionServices(
  authAdapter: TikTokAuthAdapter,
  config: TikTokSessionConfig,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  // Ensure entity-mapping paths use the configured API version
  setApiVersion(config.apiVersion);

  const httpClient = new TikTokHttpClient(
    authAdapter,
    authAdapter.advertiserId,
    config.baseUrl,
    logger,
    config.apiVersion
  );
  const tiktokService = new TikTokService(rateLimiter, httpClient, logger, config.apiVersion);
  const tiktokReportingService = new TikTokReportingService(
    rateLimiter,
    httpClient,
    logger,
    config.reportPollIntervalMs,
    config.reportMaxPollAttempts,
    config.apiVersion
  );

  return {
    tiktokService,
    tiktokReportingService,
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();

/**
 * Per-process store for raw report CSV bodies that `tiktok_download_report`
 * persists on demand (via `storeRawCsv: true`). Served through the
 * `report-csv://{id}` MCP resource template. Entries expire after 30 minutes.
 */
export const reportCsvStore = new ReportCsvStore();

// On session close, sweep this session's GCS spill objects and clear its
// in-memory report-csv entries.
sessionServiceStore.onDelete((sessionId) => {
  void deleteSpilledObjectsForSession("tiktok", sessionId);
  reportCsvStore.clearForSession(sessionId);
});
