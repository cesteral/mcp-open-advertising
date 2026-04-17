// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { SnapchatAuthAdapter } from "../auth/snapchat-auth-adapter.js";
import type { RateLimiter } from "../utils/security/rate-limiter.js";
import {
  deleteSpilledObjectsForSession,
  ReportCsvStore,
  SessionServiceStore,
} from "@cesteral/shared";
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
    authAdapter.adAccountId,
    rateLimiter
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

/**
 * Per-process store for raw report CSV bodies that `snapchat_download_report`
 * persists on demand (via `storeRawCsv: true`). Served through the
 * `report-csv://{id}` MCP resource template. Entries expire after 30 minutes.
 */
export const reportCsvStore = new ReportCsvStore();

// On session close, sweep this session's GCS spill objects and clear its
// in-memory report-csv entries.
sessionServiceStore.onDelete((sessionId) => {
  void deleteSpilledObjectsForSession("snapchat", sessionId);
  reportCsvStore.clearForSession(sessionId);
});