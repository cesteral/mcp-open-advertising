// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { TtdAuthAdapter } from "../auth/ttd-auth-adapter.js";
import type { RateLimiter } from "../utils/security/rate-limiter.js";
import {
  deleteSpilledObjectsForSession,
  ReportCsvStore,
  SessionServiceStore,
} from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { TtdHttpClient } from "./ttd/ttd-http-client.js";
import { TtdService } from "./ttd/ttd-service.js";
import { TtdReportingService } from "./ttd/ttd-reporting-service.js";

export interface SessionServices {
  ttdService: TtdService;
  ttdReportingService: TtdReportingService;
  authAdapter: TtdAuthAdapter;
}

export interface TtdSessionConfig {
  baseUrl: string;
  graphqlUrl?: string;
  reportPollIntervalMs?: number;
  reportMaxPollAttempts?: number;
}

export function createSessionServices(
  authAdapter: TtdAuthAdapter,
  config: TtdSessionConfig,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const httpClient = new TtdHttpClient(authAdapter, config.baseUrl, logger);
  const ttdService = new TtdService(logger, rateLimiter, httpClient, config.graphqlUrl);
  const ttdReportingService = new TtdReportingService(
    rateLimiter,
    httpClient,
    logger,
    config.reportPollIntervalMs,
    config.reportMaxPollAttempts
  );
  return {
    ttdService,
    ttdReportingService,
    authAdapter,
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();

/**
 * Per-process store for raw report CSV bodies that `ttd_download_report`
 * persists on demand (via `storeRawCsv: true`). Served through the
 * `report-csv://{id}` MCP resource template. Entries expire after 30 minutes
 * (see ReportCsvStore default TTL).
 */
export const reportCsvStore = new ReportCsvStore();

// On session close, sweep this session's GCS spill objects and clear its
// in-memory report-csv store entries. Belt-and-braces alongside the 24h
// bucket lifecycle rule.
sessionServiceStore.onDelete((sessionId) => {
  void deleteSpilledObjectsForSession("ttd", sessionId);
  reportCsvStore.clearForSession(sessionId);
});
