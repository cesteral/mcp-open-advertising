// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Streamable HTTP Transport for Meta-MCP
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
import { MetaBearerAuthStrategy } from "../../auth/meta-auth-strategy.js";
import type { MetaAuthAdapter } from "../../auth/meta-auth-adapter.js";
import { sessionServiceStore } from "../../services/session-services.js";
import { buildEnvAuthAdapter, buildSessionServices } from "../../services/session-wiring.js";
import { rateLimiter } from "../../utils/platform.js";
import { META_RETRY_CONFIG } from "../../services/meta/meta-graph-api-client.js";

function buildPlatformConfig(config: AppConfig, logger: Logger): TransportFactoryConfig {
  return {
    authStrategy:
      config.mcpAuthMode === "meta-bearer"
        ? new MetaBearerAuthStrategy(config.metaApiBaseUrl, logger)
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
      "X-Meta-App-Id",
      "X-Meta-App-Secret",
    ],
    authErrorHint:
      config.mcpAuthMode === "meta-bearer"
        ? "Provide a Meta access token via Authorization: Bearer <token> header."
        : "Provide a valid Bearer token in the Authorization header.",
    sessionServiceStore,
    rateLimiter,
    // #201: the server card publishes the retry policy a caller will actually
    // meet. Passing this server's own RetryConfig (rather than letting the card
    // assume fleet defaults) is what keeps the published attempt count true —
    // amazon-dsp's budget is 2, not 3, and its predicate omits 429.
    retryDescriptor: {
      maxRetries: META_RETRY_CONFIG.maxRetries,
    },
    createSessionForAuth: createSessionForAuthWithEnvFallback({
      sessionServiceStore,
      adapterFromAuth: (authResult) =>
        authResult.platformAuthAdapter as MetaAuthAdapter | undefined,
      validateAuthAdapter: false,
      buildServices: buildSessionServices,
      buildEnvAdapter: buildEnvAuthAdapter,
      credentialsRequiredMessage:
        "Meta access token required. Set META_ACCESS_TOKEN env var, or use MCP_AUTH_MODE=meta-bearer.",
      unsupportedModeMessage: "Meta API credentials required for this server.",
    }),
    async createMcpServer(log, sessionId, gcsBucket) {
      return createMcpServer(log, sessionId, gcsBucket);
    },
    packageJsonPath: new URL("../../../package.json", import.meta.url).pathname,
    serverCard: buildServerCardExtras("meta-mcp"),
  };
}

export const { createMcpHttpServer, startHttpServer } =
  createTransportEntrypoints<AppConfig>(buildPlatformConfig);
