// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { AppConfig } from "../config/index.js";
import {
  LinkedInAccessTokenAdapter,
  LinkedInRefreshTokenAdapter,
  type LinkedInAuthAdapter,
} from "../auth/linkedin-auth-adapter.js";
import { rateLimiter } from "../utils/platform.js";
import { createSessionServices, type SessionServices } from "./session-services.js";

/** The one place session services are built, for stdio and every HTTP session path. */
export function buildSessionServices(
  cfg: AppConfig,
  adapter: LinkedInAuthAdapter,
  logger: Logger
): SessionServices {
  return createSessionServices(
    adapter,
    { baseUrl: cfg.linkedinApiBaseUrl, apiVersion: cfg.linkedinApiVersion },
    logger,
    rateLimiter
  );
}

/**
 * Adapter for none/jwt-mode HTTP sessions, from env vars. Prefers the
 * refresh-token flow when client credentials are configured.
 */
export function buildEnvAuthAdapter(cfg: AppConfig): LinkedInAuthAdapter | undefined {
  if (cfg.linkedinClientId && cfg.linkedinClientSecret && cfg.linkedinRefreshToken) {
    return new LinkedInRefreshTokenAdapter(
      {
        clientId: cfg.linkedinClientId,
        clientSecret: cfg.linkedinClientSecret,
        refreshToken: cfg.linkedinRefreshToken,
      },
      cfg.linkedinApiBaseUrl,
      cfg.linkedinApiVersion
    );
  }

  if (cfg.linkedinAccessToken) {
    return new LinkedInAccessTokenAdapter(
      cfg.linkedinAccessToken,
      cfg.linkedinApiBaseUrl,
      cfg.linkedinApiVersion
    );
  }
  return undefined;
}
