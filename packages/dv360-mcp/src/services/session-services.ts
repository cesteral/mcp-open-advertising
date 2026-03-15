// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { GoogleAuthAdapter } from "@cesteral/shared";
import { SessionServiceStore } from "@cesteral/shared";
import { RateLimiter } from "../utils/security/rate-limiter.js";
import { DV360HttpClient } from "./dv360/dv360-http-client.js";
import { DV360Service } from "./dv360/DV360-service.js";
import { TargetingService } from "./targeting/targeting-service.js";

export interface DV360SessionConfig {
  baseUrl: string;
}

export interface SessionServices {
  dv360Service: DV360Service;
  targetingService: TargetingService;
}

export function createSessionServices(
  authAdapter: GoogleAuthAdapter,
  config: DV360SessionConfig,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const httpClient = new DV360HttpClient(authAdapter, config.baseUrl, logger);
  const dv360Service = new DV360Service(logger, rateLimiter, httpClient);
  const targetingService = new TargetingService(logger, rateLimiter, httpClient);
  return {
    dv360Service,
    targetingService,
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();