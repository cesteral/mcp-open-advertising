// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { AppConfig } from "../config/index.js";
import {
  TikTokAccessTokenAdapter,
  TikTokRefreshTokenAdapter,
  type TikTokAuthAdapter,
} from "../auth/tiktok-auth-adapter.js";
import { rateLimiter } from "../utils/platform.js";
import { createSessionServices, type SessionServices } from "./session-services.js";

/** The one place session services are built, for stdio and every HTTP session path. */
export function buildSessionServices(
  cfg: AppConfig,
  adapter: TikTokAuthAdapter,
  logger: Logger
): SessionServices {
  return createSessionServices(
    adapter,
    {
      baseUrl: cfg.tiktokApiBaseUrl,
      reportPollIntervalMs: cfg.tiktokReportPollIntervalMs,
      reportMaxPollAttempts: cfg.tiktokReportMaxPollAttempts,
      apiVersion: cfg.tiktokApiVersion,
    },
    logger,
    rateLimiter
  );
}

/**
 * Adapter for none/jwt-mode HTTP sessions, from env vars. Refresh credentials
 * are used only when no static token is configured: TikTok documents no refresh
 * endpoint, so TikTokRefreshTokenAdapter.validate() rejects with a clear
 * Unauthorized error. A configured static token wins.
 */
export function buildEnvAuthAdapter(cfg: AppConfig): TikTokAuthAdapter | undefined {
  const advertiserId = cfg.tiktokAdvertiserId;
  if (!advertiserId) return undefined;

  if (!cfg.tiktokAccessToken && cfg.tiktokAppId && cfg.tiktokAppSecret && cfg.tiktokRefreshToken) {
    return new TikTokRefreshTokenAdapter(
      {
        appId: cfg.tiktokAppId,
        appSecret: cfg.tiktokAppSecret,
        refreshToken: cfg.tiktokRefreshToken,
      },
      advertiserId,
      cfg.tiktokApiBaseUrl,
      cfg.tiktokApiVersion
    );
  }

  if (cfg.tiktokAccessToken) {
    return new TikTokAccessTokenAdapter(
      cfg.tiktokAccessToken,
      advertiserId,
      cfg.tiktokApiBaseUrl,
      cfg.tiktokApiVersion
    );
  }
  return undefined;
}
