// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Streamable HTTP Transport for AmazonDsp-MCP
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
import { AmazonDspBearerAuthStrategy } from "../../auth/amazon-dsp-auth-strategy.js";
import type { AmazonDspAuthAdapter } from "../../auth/amazon-dsp-auth-adapter.js";
import { sessionServiceStore } from "../../services/session-services.js";
import { buildEnvAuthAdapter, buildSessionServices } from "../../services/session-wiring.js";
import { rateLimiter } from "../../utils/platform.js";
import { buildRefreshTokenAgeHealth } from "../../utils/refresh-token-age.js";
import {
  AMAZON_DSP_RETRY_CONFIG,
  isAmazonDspRetryable,
} from "../../services/amazon-dsp/amazon-dsp-http-client.js";

function buildPlatformConfig(config: AppConfig, logger: Logger): TransportFactoryConfig {
  return {
    authStrategy:
      config.mcpAuthMode === "amazon-dsp-bearer"
        ? new AmazonDspBearerAuthStrategy(config.amazonDspApiBaseUrl, logger)
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
      "Amazon-Advertising-API-Scope",
      "Amazon-Advertising-API-ClientId",
      "X-AmazonDsp-App-Id",
      "X-AmazonDsp-App-Secret",
      "X-AmazonDsp-Refresh-Token",
    ],
    authErrorHint:
      config.mcpAuthMode === "amazon-dsp-bearer"
        ? "Provide an Amazon access token via Authorization: Bearer <token>, profile ID via Amazon-Advertising-API-Scope, and client ID via Amazon-Advertising-API-ClientId. " +
          "If the error mentions invalid_grant, the refresh token is expired or revoked (Amazon expires refresh tokens 365 days after consent granted on/after 2026-07-30) — the advertiser must re-authorize the app to obtain a new one."
        : "Provide a valid Bearer token in the Authorization header.",
    sessionServiceStore,
    rateLimiter,
    // #201: the server card publishes the retry policy a caller will actually
    // meet. Passing this server's own RetryConfig (rather than letting the card
    // assume fleet defaults) is what keeps the published attempt count true —
    // amazon-dsp's budget is 2, not 3, and its predicate omits 429.
    retryDescriptor: {
      maxRetries: AMAZON_DSP_RETRY_CONFIG.maxRetries,
      isRetryable: isAmazonDspRetryable,
    },
    // Age of the env-configured refresh token (opt-in via
    // AMAZON_DSP_REFRESH_TOKEN_ISSUED_AT) so alerting can scrape /health and
    // page before Amazon's 365-day lifetime expires it. Per-session tokens
    // supplied via headers are the caller's to track.
    healthExtras: () =>
      buildRefreshTokenAgeHealth(
        config.amazonDspRefreshTokenIssuedAt,
        new Date(),
        config.amazonDspRefreshTokenWarnAgeDays
      ) ?? {},
    createSessionForAuth: createSessionForAuthWithEnvFallback({
      sessionServiceStore,
      adapterFromAuth: (authResult) =>
        authResult.platformAuthAdapter as AmazonDspAuthAdapter | undefined,
      validateAuthAdapter: false,
      buildServices: buildSessionServices,
      buildEnvAdapter: buildEnvAuthAdapter,
      credentialsRequiredMessage:
        "Amazon DSP access token and profile ID required. Set AMAZON_DSP_ACCESS_TOKEN and AMAZON_DSP_PROFILE_ID env vars, or use MCP_AUTH_MODE=amazon-dsp-bearer.",
      unsupportedModeMessage: "AmazonDsp API credentials required for this server.",
    }),
    async createMcpServer(log, sessionId, gcsBucket) {
      return createMcpServer(log, sessionId, gcsBucket);
    },
    packageJsonPath: new URL("../../../package.json", import.meta.url).pathname,
    serverCard: buildServerCardExtras("amazon-dsp-mcp"),
  };
}

export const { createMcpHttpServer, startHttpServer } =
  createTransportEntrypoints<AppConfig>(buildPlatformConfig);
