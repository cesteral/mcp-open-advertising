// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { AppConfig } from "../config/index.js";
import { SA360RefreshTokenAuthAdapter, type SA360AuthAdapter } from "../auth/sa360-auth-adapter.js";
import { rateLimiter } from "../utils/platform.js";
import { createSessionServices, type SessionServices } from "./session-services.js";

/** The one place session services are built, for stdio and every HTTP session path. */
export function buildSessionServices(
  cfg: AppConfig,
  adapter: SA360AuthAdapter,
  logger: Logger
): SessionServices {
  return createSessionServices(
    adapter,
    { baseUrl: cfg.sa360ApiBaseUrl, v2BaseUrl: cfg.sa360V2ApiBaseUrl },
    logger,
    rateLimiter
  );
}

/**
 * Adapter from env vars, for stdio and none/jwt-mode HTTP. Needs the OAuth2
 * client id, client secret and refresh token.
 */
export function buildEnvAuthAdapter(cfg: AppConfig): SA360AuthAdapter | undefined {
  if (!cfg.sa360ClientId || !cfg.sa360ClientSecret || !cfg.sa360RefreshToken) return undefined;
  return new SA360RefreshTokenAuthAdapter({
    clientId: cfg.sa360ClientId,
    clientSecret: cfg.sa360ClientSecret,
    refreshToken: cfg.sa360RefreshToken,
    loginCustomerId: cfg.sa360LoginCustomerId,
  });
}
