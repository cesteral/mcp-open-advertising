// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { AmazonDspAuthAdapter } from "../auth/amazon-dsp-auth-adapter.js";
import type { RateLimiter } from "../utils/security/rate-limiter.js";
import {
  deleteSpilledObjectsForSession,
  ReportCsvStore,
  SessionServiceStore,
} from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { AmazonDspHttpClient } from "./amazon-dsp/amazon-dsp-http-client.js";
import { AmazonDspService } from "./amazon-dsp/amazon-dsp-service.js";
import { AmazonDspReportingService } from "./amazon-dsp/amazon-dsp-reporting-service.js";

export interface SessionServices {
  amazonDspService: AmazonDspService;
  amazonDspReportingService: AmazonDspReportingService;
}

export interface AmazonDspSessionConfig {
  baseUrl: string;
  reportPollIntervalMs: number;
  reportMaxPollAttempts: number;
  clientId?: string;
}

export function createSessionServices(
  authAdapter: AmazonDspAuthAdapter,
  config: AmazonDspSessionConfig,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const httpClient = new AmazonDspHttpClient(
    authAdapter,
    authAdapter.profileId,
    config.baseUrl,
    logger,
    config.clientId
  );
  const amazonDspService = new AmazonDspService(rateLimiter, httpClient);
  const amazonDspReportingService = new AmazonDspReportingService(
    rateLimiter,
    httpClient,
    logger,
    config.reportPollIntervalMs,
    config.reportMaxPollAttempts
  );

  return {
    amazonDspService,
    amazonDspReportingService,
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();

/**
 * Per-process store for raw report CSV/JSON bodies that
 * `amazon_dsp_download_report` persists on demand (via `storeRawCsv: true`).
 * Served through the `report-csv://{id}` MCP resource template. Entries
 * expire after 30 minutes.
 */
export const reportCsvStore = new ReportCsvStore();

// On session close, sweep this session's GCS spill objects and clear its
// in-memory report-csv entries. Note: slug "amazonDsp" matches the
// canonical ReportingPlatform value used by the spill helper.
sessionServiceStore.onDelete((sessionId) => {
  void deleteSpilledObjectsForSession("amazonDsp", sessionId);
  reportCsvStore.clearForSession(sessionId);
});
