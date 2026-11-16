// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { AppConfig } from "../config/index.js";
import { MsAdsAccessTokenAdapter, type MsAdsAuthAdapter } from "../auth/msads-auth-adapter.js";
import { rateLimiter } from "../utils/platform.js";
import { createSessionServices, type SessionServices } from "./session-services.js";

/** The one place session services are built, for stdio and every HTTP session path. */
export function buildSessionServices(
  cfg: AppConfig,
  adapter: MsAdsAuthAdapter,
  logger: Logger
): SessionServices {
  return createSessionServices(
    adapter,
    {
      campaignApiBaseUrl: cfg.msadsCampaignApiBaseUrl,
      reportingApiBaseUrl: cfg.msadsReportingApiBaseUrl,
      customerApiBaseUrl: cfg.msadsCustomerApiBaseUrl,
      reportPollIntervalMs: cfg.msadsReportPollIntervalMs,
      reportMaxPollAttempts: cfg.msadsReportMaxPollAttempts,
    },
    logger,
    rateLimiter
  );
}

/**
 * Adapter from env vars, for stdio and none/jwt-mode HTTP. Microsoft Ads needs
 * all four of the access token, developer token, customer id and account id.
 */
export function buildEnvAuthAdapter(cfg: AppConfig): MsAdsAuthAdapter | undefined {
  const { msadsAccessToken, msadsDeveloperToken, msadsCustomerId, msadsAccountId } = cfg;
  if (!msadsAccessToken || !msadsDeveloperToken || !msadsCustomerId || !msadsAccountId) {
    return undefined;
  }
  return new MsAdsAccessTokenAdapter(
    msadsAccessToken,
    msadsDeveloperToken,
    msadsCustomerId,
    msadsAccountId,
    cfg.msadsCustomerApiBaseUrl
  );
}
