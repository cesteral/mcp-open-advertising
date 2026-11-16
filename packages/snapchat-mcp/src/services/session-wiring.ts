// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { AppConfig } from "../config/index.js";
import {
  createSnapchatEnvAuthAdapter,
  type SnapchatAuthAdapter,
} from "../auth/snapchat-auth-adapter.js";
import { rateLimiter } from "../utils/platform.js";
import { createSessionServices, type SessionServices } from "./session-services.js";

/** The one place session services are built, for stdio and every HTTP session path. */
export function buildSessionServices(
  cfg: AppConfig,
  adapter: SnapchatAuthAdapter,
  logger: Logger
): SessionServices {
  return createSessionServices(
    adapter,
    {
      baseUrl: cfg.snapchatApiBaseUrl,
      reportPollIntervalMs: cfg.snapchatReportPollIntervalMs,
      reportMaxPollAttempts: cfg.snapchatReportMaxPollAttempts,
    },
    logger,
    rateLimiter
  );
}

/** Adapter from env vars, for stdio and for none/jwt-mode HTTP sessions. */
export function buildEnvAuthAdapter(cfg: AppConfig): SnapchatAuthAdapter | undefined {
  return createSnapchatEnvAuthAdapter({
    baseUrl: cfg.snapchatApiBaseUrl,
    adAccountId: cfg.snapchatAdAccountId,
    orgId: cfg.snapchatOrgId,
    accessToken: cfg.snapchatAccessToken,
    appId: cfg.snapchatAppId,
    appSecret: cfg.snapchatAppSecret,
    refreshToken: cfg.snapchatRefreshToken,
  });
}
