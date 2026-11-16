// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { AppConfig } from "../config/index.js";
import { GAdsRefreshTokenAuthAdapter, type GAdsAuthAdapter } from "../auth/gads-auth-adapter.js";
import { rateLimiter } from "../utils/platform.js";
import { createSessionServices, type SessionServices } from "./session-services.js";

/** The one place session services are built, for stdio and every HTTP session path. */
export function buildSessionServices(
  cfg: AppConfig,
  adapter: GAdsAuthAdapter,
  logger: Logger
): SessionServices {
  return createSessionServices(adapter, { baseUrl: cfg.gadsApiBaseUrl }, logger, rateLimiter);
}

/**
 * Adapter from env vars, for stdio and none/jwt-mode HTTP. Needs the developer
 * token plus the OAuth2 client id, client secret and refresh token.
 */
export function buildEnvAuthAdapter(cfg: AppConfig): GAdsAuthAdapter | undefined {
  if (
    !cfg.gadsDeveloperToken ||
    !cfg.gadsClientId ||
    !cfg.gadsClientSecret ||
    !cfg.gadsRefreshToken
  ) {
    return undefined;
  }
  return new GAdsRefreshTokenAuthAdapter({
    developerToken: cfg.gadsDeveloperToken,
    clientId: cfg.gadsClientId,
    clientSecret: cfg.gadsClientSecret,
    refreshToken: cfg.gadsRefreshToken,
    loginCustomerId: cfg.gadsLoginCustomerId,
  });
}
