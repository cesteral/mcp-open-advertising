// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { AppConfig } from "../config/index.js";
import {
  MetaAccessTokenAdapter,
  MetaRefreshTokenAdapter,
  type MetaAuthAdapter,
} from "../auth/meta-auth-adapter.js";
import { rateLimiter } from "../utils/platform.js";
import { createSessionServices, type SessionServices } from "./session-services.js";

/** The one place session services are built, for stdio and every HTTP session path. */
export function buildSessionServices(
  cfg: AppConfig,
  adapter: MetaAuthAdapter,
  logger: Logger
): SessionServices {
  return createSessionServices(adapter, { baseUrl: cfg.metaApiBaseUrl }, logger, rateLimiter);
}

/**
 * Adapter for none/jwt-mode HTTP sessions, from env vars. Prefers the token
 * exchange flow when app credentials are configured.
 */
export function buildEnvAuthAdapter(cfg: AppConfig): MetaAuthAdapter | undefined {
  const accessToken = cfg.metaAccessToken;
  if (!accessToken) return undefined;

  if (cfg.metaAppId && cfg.metaAppSecret) {
    return new MetaRefreshTokenAdapter(
      accessToken,
      { appId: cfg.metaAppId, appSecret: cfg.metaAppSecret },
      cfg.metaApiBaseUrl
    );
  }
  return new MetaAccessTokenAdapter(accessToken, cfg.metaApiBaseUrl);
}
