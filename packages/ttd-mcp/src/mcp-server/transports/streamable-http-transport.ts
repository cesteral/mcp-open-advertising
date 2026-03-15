// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Streamable HTTP Transport for TTD-MCP
 *
 * Implements MCP Specification 2025-11-25 Streamable HTTP Transport.
 * Uses the shared transport factory from @cesteral/shared.
 */

import type { Logger } from "pino";
import type { AppConfig } from "../../config/index.js";
import { createMcpServer } from "../server.js";
import {
  createMcpHttpTransport,
  startMcpHttpServer,
  createAuthStrategy,
  type AuthMode,
  type McpHttpServer,
  type TransportFactoryConfig,
} from "@cesteral/shared";
import { TtdHeadersAuthStrategy } from "../../auth/ttd-auth-strategy.js";
import type { TtdAuthAdapter } from "../../auth/ttd-auth-adapter.js";
import {
  createSessionServices,
  sessionServiceStore,
} from "../../services/session-services.js";
import { rateLimiter } from "../../utils/security/rate-limiter.js";

function buildPlatformConfig(
  config: AppConfig,
  logger: Logger
): TransportFactoryConfig {
  const authStrategy = config.mcpAuthMode === "ttd-headers"
    ? new TtdHeadersAuthStrategy(config.ttdAuthUrl, logger)
    : createAuthStrategy(config.mcpAuthMode as AuthMode, {
        jwtSecret: config.mcpAuthSecretKey,
        logger,
      });

  return {
    authStrategy,
    corsAllowHeaders: [
      "Content-Type",
      "Authorization",
      "Mcp-Session-Id",
      "MCP-Protocol-Version",
      "X-TTD-Partner-Id",
      "X-TTD-Api-Secret",
    ],
    authErrorHint:
      config.mcpAuthMode === "ttd-headers"
        ? "Provide TTD credentials via X-TTD-Partner-Id and X-TTD-Api-Secret headers."
        : "Provide a valid Bearer token in the Authorization header.",
    sessionServiceStore,
    rateLimiter,
    async createSessionForAuth(authResult, sessionId, appConfig, log) {
      const ttdConfig = appConfig as AppConfig;

      // Case 1: Platform adapter available (ttd-headers mode)
      const adapter = authResult.platformAuthAdapter as TtdAuthAdapter | undefined;
      if (adapter) {
        await adapter.validate();
        const services = createSessionServices(
          adapter,
          {
            baseUrl: ttdConfig.ttdApiBaseUrl,
            graphqlUrl: ttdConfig.ttdGraphqlUrl,
            reportPollIntervalMs: ttdConfig.ttdReportPollIntervalMs,
            reportMaxPollAttempts: ttdConfig.ttdReportMaxPollAttempts,
          },
          log,
          rateLimiter
        );
        sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
        return { services };
      }

      // Case 2: none/jwt mode with env var credentials
      if (
        (ttdConfig.mcpAuthMode === "none" || ttdConfig.mcpAuthMode === "jwt") &&
        ttdConfig.ttdPartnerId &&
        ttdConfig.ttdApiSecret
      ) {
        const { TtdApiTokenAuthAdapter } = await import("../../auth/ttd-auth-adapter.js");
        const envAdapter = new TtdApiTokenAuthAdapter(
          { partnerId: ttdConfig.ttdPartnerId, apiSecret: ttdConfig.ttdApiSecret },
          ttdConfig.ttdAuthUrl
        );
        await envAdapter.validate();
        const services = createSessionServices(
          envAdapter,
          {
            baseUrl: ttdConfig.ttdApiBaseUrl,
            graphqlUrl: ttdConfig.ttdGraphqlUrl,
            reportPollIntervalMs: ttdConfig.ttdReportPollIntervalMs,
            reportMaxPollAttempts: ttdConfig.ttdReportMaxPollAttempts,
          },
          log,
          rateLimiter
        );
        sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
        return { services };
      }

      // Case 3: none mode without credentials — protocol-only session (tools will fail at runtime)
      if (ttdConfig.mcpAuthMode === "none") {
        return { services: null };
      }

      // Case 4: jwt mode without env credentials — error
      return {
        services: null,
        error: {
          message:
            "TTD credentials required. Set TTD_PARTNER_ID and TTD_API_SECRET env vars, or use MCP_AUTH_MODE=ttd-headers.",
          status: 400 as const,
        },
      };
    },
    async createMcpServer(log, sessionId, gcsBucket) {
      return createMcpServer(log, sessionId, gcsBucket);
    },
    packageJsonPath: new URL("../../../package.json", import.meta.url).pathname,
    platformDisplayName: "TTD",
  };
}

export function createMcpHttpServer(
  config: AppConfig,
  logger: Logger
): { app: ReturnType<typeof createMcpHttpTransport>["app"]; shutdown: () => Promise<void> } {
  return createMcpHttpTransport(config, logger, buildPlatformConfig(config, logger));
}

export async function startHttpServer(
  config: AppConfig,
  logger: Logger
): Promise<McpHttpServer> {
  return startMcpHttpServer(config, logger, buildPlatformConfig(config, logger));
}