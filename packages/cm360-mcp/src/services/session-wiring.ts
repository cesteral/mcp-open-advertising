// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { GoogleAuthAdapter } from "@cesteral/shared";
import type { AppConfig } from "../config/index.js";
import { rateLimiter } from "../utils/platform.js";
import { createSessionServices, type SessionServices } from "./session-services.js";

/**
 * The one place session services are built, for stdio and every HTTP session
 * path. The fingerprint keys the session's per-user CM360 rate limit.
 */
export function buildSessionServices(
  cfg: AppConfig,
  adapter: GoogleAuthAdapter,
  logger: Logger,
  credentialFingerprint: string | undefined
): SessionServices {
  return createSessionServices(
    adapter,
    { baseUrl: cfg.cm360ApiBaseUrl },
    logger,
    rateLimiter,
    credentialFingerprint
  );
}
