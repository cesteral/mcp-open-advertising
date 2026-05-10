// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { LinkedInAuthAdapter } from "../auth/linkedin-auth-adapter.js";
import type { RateLimiter } from "@cesteral/shared";
import { SessionServiceStore } from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { LinkedInHttpClient } from "./linkedin/linkedin-http-client.js";
import { LinkedInService } from "./linkedin/linkedin-service.js";
import { LinkedInReportingService } from "./linkedin/linkedin-reporting-service.js";

export interface SessionServices {
  linkedInService: LinkedInService;
  linkedInReportingService: LinkedInReportingService;
}

export interface LinkedInSessionConfig {
  baseUrl: string;
  apiVersion: string;
}

export function createSessionServices(
  authAdapter: LinkedInAuthAdapter,
  config: LinkedInSessionConfig,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const httpClient = new LinkedInHttpClient(authAdapter, config.baseUrl, config.apiVersion, logger);
  const linkedInService = new LinkedInService(rateLimiter, httpClient);
  const linkedInReportingService = new LinkedInReportingService(rateLimiter, httpClient);
  return {
    linkedInService,
    linkedInReportingService,
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();
