// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { AmazonDspAuthAdapter } from "../auth/amazon-dsp-auth-adapter.js";
import type { RateLimiter } from "@cesteral/shared";
import {
  deleteSpilledObjectsForSession,
  ReportCsvStore,
  SessionServiceStore,
} from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { AmazonDspHttpClient } from "./amazon-dsp/amazon-dsp-http-client.js";
import { AmazonDspService } from "./amazon-dsp/amazon-dsp-service.js";
import { AmazonDspReportingService } from "./amazon-dsp/amazon-dsp-reporting-service.js";
import { AmazonDspV1Service } from "./amazon-dsp/amazon-dsp-v1-service.js";

export interface SessionServices {
  amazonDspService: AmazonDspService;
  amazonDspReportingService: AmazonDspReportingService;
  amazonDspV1Service: AmazonDspV1Service;
  /**
   * The profile id this session is bound to at authentication time. Used by
   * tool handlers to fail-fast (via `assertAccountScope`) when a caller-supplied
   * `profileId` names a different profile than the session is bound to.
   */
  boundProfileId: string;
}

export interface AmazonDspSessionConfig {
  baseUrl: string;
  reportPollIntervalMs: number;
  reportMaxPollAttempts: number;
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
    logger
  );
  const amazonDspService = new AmazonDspService(rateLimiter, httpClient);
  const amazonDspReportingService = new AmazonDspReportingService(
    rateLimiter,
    httpClient,
    logger,
    config.reportPollIntervalMs,
    config.reportMaxPollAttempts
  );
  const amazonDspV1Service = new AmazonDspV1Service(httpClient, logger);

  return {
    amazonDspService,
    amazonDspReportingService,
    amazonDspV1Service,
    boundProfileId: authAdapter.profileId,
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();

/**
 * Per-process store for raw report CSV/JSON bodies that
 * `amazon_dsp_download_report` persists on demand (via `storeRawCsv: true`).
 * Served through the `report-csv://{id}` MCP resource template. Entries
 * expire after 30 minutes.
 */
export const reportCsvStore = new ReportCsvStore({
  // Mirror entries to GCS so the report-csv:// URI survives Cloud Run scale-out.
  // Reuses REPORT_SPILL_BUCKET; no-op when unset.
  mirror: { bucketResolver: () => process.env.REPORT_SPILL_BUCKET },
});

// On session close, sweep this session's GCS spill objects and clear its
// in-memory report-csv entries. Note: slug "amazonDsp" matches the
// canonical ReportingPlatform value used by the spill helper.
sessionServiceStore.onDelete((sessionId) => {
  void deleteSpilledObjectsForSession("amazonDsp", sessionId);
  reportCsvStore.clearForSession(sessionId);
});
