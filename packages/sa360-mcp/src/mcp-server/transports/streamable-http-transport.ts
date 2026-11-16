// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Streamable HTTP Transport for SA360-MCP
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
  type TransportFactoryConfig,
  buildServerCardExtras,
  createTransportEntrypoints,
  createSessionForAuthWithEnvFallback,
} from "@cesteral/shared";
import { SA360HeadersAuthStrategy } from "../../auth/sa360-auth-strategy.js";
import type { SA360AuthAdapter } from "../../auth/sa360-auth-adapter.js";
import { sessionServiceStore } from "../../services/session-services.js";
import { buildEnvAuthAdapter, buildSessionServices } from "../../services/session-wiring.js";
import { rateLimiter } from "../../utils/platform.js";
import { SA360_RETRY_CONFIG } from "../../services/sa360/sa360-http-client.js";

function buildPlatformConfig(config: AppConfig, logger: Logger): TransportFactoryConfig {
  return {
    authStrategy:
      config.mcpAuthMode === "sa360-headers"
        ? new SA360HeadersAuthStrategy(logger)
        : createAuthStrategy(config.mcpAuthMode as AuthMode, {
            jwtSecret: config.mcpAuthSecretKey,
            logger,
          }),
    corsAllowHeaders: [
      "Content-Type",
      "Authorization",
      "Mcp-Session-Id",
      "MCP-Protocol-Version",
      "X-Cesteral-Decision-Token",
      "X-SA360-Client-Id",
      "X-SA360-Client-Secret",
      "X-SA360-Refresh-Token",
      "X-SA360-Login-Customer-Id",
    ],
    authErrorHint:
      config.mcpAuthMode === "sa360-headers"
        ? "Provide SA360 credentials via X-SA360-Client-Id, X-SA360-Client-Secret, and X-SA360-Refresh-Token headers."
        : "Provide a valid Bearer token in the Authorization header.",
    sessionServiceStore,
    rateLimiter,
    // #201: the server card publishes the retry policy a caller will actually
    // meet. Passing this server's own RetryConfig (rather than letting the card
    // assume fleet defaults) is what keeps the published attempt count true —
    // amazon-dsp's budget is 2, not 3, and its predicate omits 429.
    retryDescriptor: {
      maxRetries: SA360_RETRY_CONFIG.maxRetries,
    },
    createSessionForAuth: createSessionForAuthWithEnvFallback({
      sessionServiceStore,
      adapterFromAuth: (authResult) =>
        authResult.platformAuthAdapter as SA360AuthAdapter | undefined,
      validateAuthAdapter: true,
      buildServices: buildSessionServices,
      buildEnvAdapter: buildEnvAuthAdapter,
      credentialsRequiredMessage:
        "SA360 credentials required. Set SA360_CLIENT_ID, SA360_CLIENT_SECRET, and SA360_REFRESH_TOKEN env vars, or use MCP_AUTH_MODE=sa360-headers.",
      unsupportedModeMessage: "SA360 API credentials required for this server.",
    }),
    async createMcpServer(log, sessionId, gcsBucket) {
      return createMcpServer(log, sessionId, gcsBucket);
    },
    packageJsonPath: new URL("../../../package.json", import.meta.url).pathname,
    serverCard: buildServerCardExtras("sa360-mcp"),
  };
}

export const { createMcpHttpServer, startHttpServer } =
  createTransportEntrypoints<AppConfig>(buildPlatformConfig);
