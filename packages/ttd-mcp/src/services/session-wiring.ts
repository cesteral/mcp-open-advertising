// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { AppConfig } from "../config/index.js";
import { TtdDirectTokenAuthAdapter, type TtdAuthAdapter } from "../auth/ttd-auth-adapter.js";
import { rateLimiter } from "../utils/platform.js";
import { createSessionServices, type SessionServices } from "./session-services.js";

/** The one place session services are built, for stdio and every HTTP session path. */
export function buildSessionServices(
  cfg: AppConfig,
  adapter: TtdAuthAdapter,
  logger: Logger
): SessionServices {
  return createSessionServices(
    adapter,
    {
      baseUrl: cfg.ttdApiBaseUrl,
      graphqlUrl: cfg.ttdGraphqlUrl,
      reportPollIntervalMs: cfg.ttdReportPollIntervalMs,
      reportMaxPollAttempts: cfg.ttdReportMaxPollAttempts,
    },
    logger,
    rateLimiter
  );
}

/** Adapter from the pre-generated user token in env vars, for stdio and none/jwt-mode HTTP. */
export function buildEnvAuthAdapter(cfg: AppConfig): TtdAuthAdapter | undefined {
  return cfg.ttdApiToken
    ? new TtdDirectTokenAuthAdapter(cfg.ttdApiToken, cfg.ttdGraphqlUrl)
    : undefined;
}
