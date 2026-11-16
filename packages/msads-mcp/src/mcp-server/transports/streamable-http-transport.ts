// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Streamable HTTP Transport for msads-mcp
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
import { MsAdsBearerAuthStrategy } from "../../auth/msads-auth-strategy.js";
import type { MsAdsAuthAdapter } from "../../auth/msads-auth-adapter.js";
import { sessionServiceStore } from "../../services/session-services.js";
import { buildEnvAuthAdapter, buildSessionServices } from "../../services/session-wiring.js";
import { rateLimiter } from "../../utils/platform.js";
import { MSADS_RETRY_CONFIG } from "../../services/msads/msads-http-client.js";

function buildPlatformConfig(config: AppConfig, logger: Logger): TransportFactoryConfig {
  return {
    authStrategy:
      config.mcpAuthMode === "msads-bearer"
        ? new MsAdsBearerAuthStrategy(config.msadsCustomerApiBaseUrl)
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
      "X-MSAds-Developer-Token",
      "X-MSAds-Customer-Id",
      "X-MSAds-Account-Id",
    ],
    authErrorHint:
      config.mcpAuthMode === "msads-bearer"
        ? "Provide an OAuth2 access token via Authorization: Bearer <token> header, plus X-MSAds-Developer-Token, X-MSAds-Customer-Id, and X-MSAds-Account-Id headers."
        : "Provide a valid Bearer token in the Authorization header.",
    sessionServiceStore,
    rateLimiter,
    // #201: the server card publishes the retry policy a caller will actually
    // meet. Passing this server's own RetryConfig (rather than letting the card
    // assume fleet defaults) is what keeps the published attempt count true —
    // amazon-dsp's budget is 2, not 3, and its predicate omits 429.
    retryDescriptor: {
      maxRetries: MSADS_RETRY_CONFIG.maxRetries,
    },
    createSessionForAuth: createSessionForAuthWithEnvFallback({
      sessionServiceStore,
      adapterFromAuth: (authResult) =>
        authResult.platformAuthAdapter as MsAdsAuthAdapter | undefined,
      validateAuthAdapter: false,
      buildServices: buildSessionServices,
      buildEnvAdapter: buildEnvAuthAdapter,
      credentialsRequiredMessage:
        "Microsoft Ads credentials required. Set MSADS_ACCESS_TOKEN, MSADS_DEVELOPER_TOKEN, MSADS_CUSTOMER_ID, and MSADS_ACCOUNT_ID env vars, or use MCP_AUTH_MODE=msads-bearer.",
      unsupportedModeMessage: "Microsoft Ads API credentials required for this server.",
    }),
    async createMcpServer(log, sessionId, gcsBucket) {
      return createMcpServer(log, sessionId, gcsBucket);
    },
    packageJsonPath: new URL("../../../package.json", import.meta.url).pathname,
    serverCard: buildServerCardExtras("msads-mcp"),
  };
}

export const { createMcpHttpServer, startHttpServer } =
  createTransportEntrypoints<AppConfig>(buildPlatformConfig);
