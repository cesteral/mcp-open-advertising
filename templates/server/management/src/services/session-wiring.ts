// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { AppConfig } from "../config/index.js";
import {
  {{Pascal}}AccessTokenAdapter,
  type {{Pascal}}AuthAdapter,
} from "../auth/{{key}}-auth-adapter.js";
import { rateLimiter } from "../utils/platform.js";
import { createSessionServices, type SessionServices } from "./session-services.js";

/** The one place session services are built, for stdio and every HTTP session path. */
export function buildSessionServices(
  cfg: AppConfig,
  adapter: {{Pascal}}AuthAdapter,
  logger: Logger
): SessionServices {
  return createSessionServices(adapter, { baseUrl: cfg.apiBaseUrl }, logger, rateLimiter);
}

/** Adapter for stdio and none/jwt-mode HTTP sessions, from env vars. */
export function buildEnvAuthAdapter(cfg: AppConfig): {{Pascal}}AuthAdapter | undefined {
  if (!cfg.accessToken || !cfg.accountId) return undefined;
  return new {{Pascal}}AccessTokenAdapter(cfg.accessToken, cfg.accountId, cfg.apiBaseUrl);
}
