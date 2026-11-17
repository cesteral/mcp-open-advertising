// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Streamable HTTP Transport for DV360-MCP
 *
 * Implements MCP Specification 2025-11-25 Streamable HTTP Transport.
 * Uses the shared transport factory from @cesteral/shared.
 */

import type { Logger } from "pino";
import type { AppConfig } from "../../config/index.js";
import { createMcpServer } from "../server.js";
import {
  createAuthStrategy,
  type AuthMode,
  type GoogleAuthAdapter,
  type TransportFactoryConfig,
  buildServerCardExtras,
  createTransportEntrypoints,
  createSessionForAuthWithEnvFallback,
} from "@cesteral/shared";
import { sessionServiceStore } from "../../services/session-services.js";
import { buildSessionServices } from "../../services/session-wiring.js";
import { rateLimiter } from "../../utils/platform.js";
import { DV360_RETRY_CONFIG } from "../../services/dv360/dv360-http-client.js";

function buildPlatformConfig(config: AppConfig, logger: Logger): TransportFactoryConfig {
  return {
    authStrategy: createAuthStrategy(config.mcpAuthMode as AuthMode, {
      scopes: ["https://www.googleapis.com/auth/display-video"],
      jwtSecret: config.mcpAuthSecretKey,
      logger,
    }),
    corsAllowHeaders: [
      "Content-Type",
      "Authorization",
      "Mcp-Session-Id",
      "MCP-Protocol-Version",
      "X-Cesteral-Decision-Token",
      "X-Cesteral-Google-Auth-Type",
      "X-Cesteral-Google-Credentials",
      "X-Cesteral-Google-Client-Id",
      "X-Cesteral-Google-Client-Secret",
      "X-Cesteral-Google-Refresh-Token",
    ],
    authErrorHint:
      config.mcpAuthMode === "google-headers"
        ? "Provide Google credentials via X-Cesteral-Google-Auth-Type and associated headers."
        : "Provide a valid Bearer token in the Authorization header.",
    sessionServiceStore,
    rateLimiter,
    // #201: the server card publishes the retry policy a caller will actually
    // meet. Passing this server's own RetryConfig (rather than letting the card
    // assume fleet defaults) is what keeps the published attempt count true —
    // amazon-dsp's budget is 2, not 3, and its predicate omits 429.
    retryDescriptor: {
      maxRetries: DV360_RETRY_CONFIG.maxRetries,
    },
    createSessionForAuth: createSessionForAuthWithEnvFallback({
      sessionServiceStore,
      adapterFromAuth: (authResult) =>
        authResult.googleAuthAdapter as GoogleAuthAdapter | undefined,
      validateAuthAdapter: true,
      buildServices: buildSessionServices,
      credentialsRequiredMessage:
        "Google API credentials required for this server. Use MCP_AUTH_MODE=google-headers.",
    }),
    async createMcpServer(log, sessionId, gcsBucket) {
      return createMcpServer(log, sessionId, gcsBucket);
    },
    packageJsonPath: new URL("../../../package.json", import.meta.url).pathname,
    serverCard: buildServerCardExtras("dv360-mcp"),
  };
}

export const { createMcpHttpServer, startHttpServer } =
  createTransportEntrypoints<AppConfig>(buildPlatformConfig);
