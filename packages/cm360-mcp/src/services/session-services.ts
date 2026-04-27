// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { GoogleAuthAdapter } from "@cesteral/shared";
import { SessionServiceStore } from "@cesteral/shared";
import { RateLimiter } from "../utils/security/rate-limiter.js";
import { CM360HttpClient } from "./cm360/cm360-http-client.js";
import { CM360Service } from "./cm360/cm360-service.js";
import { CM360ReportingService } from "./cm360/cm360-reporting-service.js";

export interface CM360SessionConfig {
  baseUrl: string;
}

export interface SessionServices {
  cm360Service: CM360Service;
  cm360ReportingService: CM360ReportingService;
}

export function createSessionServices(
  authAdapter: GoogleAuthAdapter,
  config: CM360SessionConfig,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const httpClient = new CM360HttpClient(authAdapter, config.baseUrl, logger);
  const cm360Service = new CM360Service(logger, rateLimiter, httpClient);
  const cm360ReportingService = new CM360ReportingService(rateLimiter, httpClient, logger);
  return {
    cm360Service,
    cm360ReportingService,
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();
