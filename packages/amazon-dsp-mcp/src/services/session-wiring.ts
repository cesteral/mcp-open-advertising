// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { AppConfig } from "../config/index.js";
import {
  AmazonDspAccessTokenAdapter,
  AmazonDspRefreshTokenAdapter,
  type AmazonDspAuthAdapter,
} from "../auth/amazon-dsp-auth-adapter.js";
import { rateLimiter } from "../utils/platform.js";
import { createSessionServices, type SessionServices } from "./session-services.js";

/** The one place session services are built, for stdio and every HTTP session path. */
export function buildSessionServices(
  cfg: AppConfig,
  adapter: AmazonDspAuthAdapter,
  logger: Logger
): SessionServices {
  return createSessionServices(
    adapter,
    {
      baseUrl: cfg.amazonDspApiBaseUrl,
      reportPollIntervalMs: cfg.amazonDspReportPollIntervalMs,
      reportMaxPollAttempts: cfg.amazonDspReportMaxPollAttempts,
    },
    logger,
    rateLimiter
  );
}

/**
 * Adapter from env vars, for stdio and for none/jwt-mode HTTP sessions. Prefers
 * the LwA refresh-token flow; the static access-token fallback passes the client
 * id, without which no ClientId header is sent and every upstream call 401s.
 */
export function buildEnvAuthAdapter(cfg: AppConfig): AmazonDspAuthAdapter | undefined {
  const profileId = cfg.amazonDspProfileId;
  if (!profileId) return undefined;

  if (cfg.amazonDspAppId && cfg.amazonDspAppSecret && cfg.amazonDspRefreshToken) {
    return new AmazonDspRefreshTokenAdapter(
      {
        appId: cfg.amazonDspAppId,
        appSecret: cfg.amazonDspAppSecret,
        refreshToken: cfg.amazonDspRefreshToken,
      },
      profileId,
      cfg.amazonDspApiBaseUrl
    );
  }

  if (cfg.amazonDspAccessToken) {
    return new AmazonDspAccessTokenAdapter(
      cfg.amazonDspAccessToken,
      profileId,
      cfg.amazonDspApiBaseUrl,
      cfg.amazonDspClientId
    );
  }
  return undefined;
}
