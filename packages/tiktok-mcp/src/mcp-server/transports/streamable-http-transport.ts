// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Streamable HTTP Transport for TikTok-MCP
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
import { TikTokBearerAuthStrategy } from "../../auth/tiktok-auth-strategy.js";
import type { TikTokAuthAdapter } from "../../auth/tiktok-auth-adapter.js";
import { sessionServiceStore } from "../../services/session-services.js";
import { buildEnvAuthAdapter, buildSessionServices } from "../../services/session-wiring.js";
import { rateLimiter } from "../../utils/platform.js";
import { TIKTOK_RETRY_CONFIG } from "../../services/tiktok/tiktok-http-client.js";

function buildPlatformConfig(config: AppConfig, logger: Logger): TransportFactoryConfig {
  return {
    authStrategy:
      config.mcpAuthMode === "tiktok-bearer"
        ? new TikTokBearerAuthStrategy(config.tiktokApiBaseUrl, logger, config.tiktokApiVersion)
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
      "X-TikTok-Advertiser-Id",
      "X-TikTok-App-Id",
      "X-TikTok-App-Secret",
      "X-TikTok-Refresh-Token",
    ],
    authErrorHint:
      config.mcpAuthMode === "tiktok-bearer"
        ? "Provide a TikTok access token via Authorization: Bearer <token> header and advertiser ID via X-TikTok-Advertiser-Id header."
        : "Provide a valid Bearer token in the Authorization header.",
    sessionServiceStore,
    rateLimiter,
    // #201: the server card publishes the retry policy a caller will actually
    // meet. Passing this server's own RetryConfig (rather than letting the card
    // assume fleet defaults) is what keeps the published attempt count true —
    // amazon-dsp's budget is 2, not 3, and its predicate omits 429.
    retryDescriptor: {
      maxRetries: TIKTOK_RETRY_CONFIG.maxRetries,
    },
    createSessionForAuth: createSessionForAuthWithEnvFallback({
      sessionServiceStore,
      // tiktok-bearer mode: the strategy already validated the adapter.
      adapterFromAuth: (authResult) =>
        authResult.platformAuthAdapter as TikTokAuthAdapter | undefined,
      validateAuthAdapter: false,
      buildServices: buildSessionServices,
      buildEnvAdapter: buildEnvAuthAdapter,
      credentialsRequiredMessage:
        "TikTok access token and advertiser ID required. Set TIKTOK_ACCESS_TOKEN and TIKTOK_ADVERTISER_ID env vars, or use MCP_AUTH_MODE=tiktok-bearer.",
      unsupportedModeMessage: "TikTok API credentials required for this server.",
    }),
    async createMcpServer(log, sessionId, gcsBucket) {
      return createMcpServer(log, sessionId, gcsBucket);
    },
    packageJsonPath: new URL("../../../package.json", import.meta.url).pathname,
    serverCard: buildServerCardExtras("tiktok-mcp"),
  };
}

export const { createMcpHttpServer, startHttpServer } =
  createTransportEntrypoints<AppConfig>(buildPlatformConfig);
