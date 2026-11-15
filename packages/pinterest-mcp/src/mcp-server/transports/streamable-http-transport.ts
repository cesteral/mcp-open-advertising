// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Streamable HTTP Transport for Pinterest-MCP
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
import { PinterestBearerAuthStrategy } from "../../auth/pinterest-auth-strategy.js";
import type { PinterestAuthAdapter } from "../../auth/pinterest-auth-adapter.js";
import { sessionServiceStore } from "../../services/session-services.js";
import { buildEnvAuthAdapter, buildSessionServices } from "../../services/session-wiring.js";
import { rateLimiter } from "../../utils/platform.js";
import { PINTEREST_RETRY_CONFIG } from "../../services/pinterest/pinterest-http-client.js";

function buildPlatformConfig(config: AppConfig, logger: Logger): TransportFactoryConfig {
  return {
    authStrategy:
      config.mcpAuthMode === "pinterest-bearer"
        ? new PinterestBearerAuthStrategy(config.pinterestApiBaseUrl, logger)
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
      "X-Pinterest-Ad-Account-Id",
      "X-Pinterest-App-Id",
      "X-Pinterest-App-Secret",
      "X-Pinterest-Refresh-Token",
    ],
    authErrorHint:
      config.mcpAuthMode === "pinterest-bearer"
        ? "Provide a Pinterest access token via Authorization: Bearer <token> header and ad account ID via X-Pinterest-Ad-Account-Id header."
        : "Provide a valid Bearer token in the Authorization header.",
    sessionServiceStore,
    rateLimiter,
    // #201: the server card publishes the retry policy a caller will actually
    // meet. Passing this server's own RetryConfig (rather than letting the card
    // assume fleet defaults) is what keeps the published attempt count true —
    // amazon-dsp's budget is 2, not 3, and its predicate omits 429.
    retryDescriptor: {
      maxRetries: PINTEREST_RETRY_CONFIG.maxRetries,
    },
    createSessionForAuth: createSessionForAuthWithEnvFallback({
      sessionServiceStore,
      adapterFromAuth: (authResult) =>
        authResult.platformAuthAdapter as PinterestAuthAdapter | undefined,
      validateAuthAdapter: false,
      buildServices: buildSessionServices,
      buildEnvAdapter: buildEnvAuthAdapter,
      credentialsRequiredMessage:
        "Pinterest access token and ad account ID required. Set PINTEREST_ACCESS_TOKEN and PINTEREST_AD_ACCOUNT_ID env vars, or use MCP_AUTH_MODE=pinterest-bearer.",
      unsupportedModeMessage: "Pinterest API credentials required for this server.",
    }),
    async createMcpServer(log, sessionId, gcsBucket) {
      return createMcpServer(log, sessionId, gcsBucket);
    },
    packageJsonPath: new URL("../../../package.json", import.meta.url).pathname,
    serverCard: buildServerCardExtras("pinterest-mcp"),
  };
}

export const { createMcpHttpServer, startHttpServer } =
  createTransportEntrypoints<AppConfig>(buildPlatformConfig);
