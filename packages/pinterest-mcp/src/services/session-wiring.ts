// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { AppConfig } from "../config/index.js";
import {
  PinterestAccessTokenAdapter,
  PinterestRefreshTokenAdapter,
  type PinterestAuthAdapter,
} from "../auth/pinterest-auth-adapter.js";
import { rateLimiter } from "../utils/platform.js";
import { createSessionServices, type SessionServices } from "./session-services.js";

/** The one place session services are built, for stdio and every HTTP session path. */
export function buildSessionServices(
  cfg: AppConfig,
  adapter: PinterestAuthAdapter,
  logger: Logger
): SessionServices {
  return createSessionServices(
    adapter,
    {
      baseUrl: cfg.pinterestApiBaseUrl,
      apiVersion: cfg.pinterestApiVersion,
      reportPollIntervalMs: cfg.pinterestReportPollIntervalMs,
      reportMaxPollAttempts: cfg.pinterestReportMaxPollAttempts,
    },
    logger,
    rateLimiter
  );
}

/**
 * Adapter for none/jwt-mode HTTP sessions, from env vars. Prefers the
 * refresh-token flow when app credentials are configured.
 */
export function buildEnvAuthAdapter(cfg: AppConfig): PinterestAuthAdapter | undefined {
  const adAccountId = cfg.pinterestAdAccountId;
  if (!adAccountId) return undefined;

  if (cfg.pinterestAppId && cfg.pinterestAppSecret && cfg.pinterestRefreshToken) {
    return new PinterestRefreshTokenAdapter(
      {
        appId: cfg.pinterestAppId,
        appSecret: cfg.pinterestAppSecret,
        refreshToken: cfg.pinterestRefreshToken,
      },
      adAccountId,
      cfg.pinterestApiBaseUrl
    );
  }

  if (cfg.pinterestAccessToken) {
    return new PinterestAccessTokenAdapter(
      cfg.pinterestAccessToken,
      adAccountId,
      cfg.pinterestApiBaseUrl
    );
  }
  return undefined;
}
