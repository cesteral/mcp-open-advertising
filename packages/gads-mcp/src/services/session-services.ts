// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { GAdsAuthAdapter } from "../auth/gads-auth-adapter.js";
import type { RateLimiter } from "@cesteral/shared";
import { SessionServiceStore } from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { GAdsHttpClient } from "./gads/gads-http-client.js";
import { GAdsService } from "./gads/gads-service.js";

export interface GAdsSessionConfig {
  baseUrl: string;
}

export interface SessionServices {
  httpClient: GAdsHttpClient;
  gadsService: GAdsService;
}

export function createSessionServices(
  authAdapter: GAdsAuthAdapter,
  config: GAdsSessionConfig,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const httpClient = new GAdsHttpClient(authAdapter, config.baseUrl, logger);
  const gadsService = new GAdsService(logger, rateLimiter, httpClient);
  return {
    httpClient,
    gadsService,
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();
