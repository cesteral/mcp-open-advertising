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
  buildServerCardExtras,
} from "@cesteral/shared";
import { TtdTokenAuthStrategy } from "../../auth/ttd-auth-strategy.js";
import type { TtdAuthAdapter } from "../../auth/ttd-auth-adapter.js";
import { TtdDirectTokenAuthAdapter } from "../../auth/ttd-auth-adapter.js";
import { createSessionServices, sessionServiceStore } from "../../services/session-services.js";
import { rateLimiter } from "../../utils/security/rate-limiter.js";

function buildPlatformConfig(config: AppConfig, logger: Logger): TransportFactoryConfig {
  const isHeaderTokenMode =
    config.mcpAuthMode === "ttd-token" || config.mcpAuthMode === "ttd-headers";
  const authStrategy = isHeaderTokenMode
    ? new TtdTokenAuthStrategy(logger)
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
      "TTD-Auth",
    ],
    authErrorHint: isHeaderTokenMode
      ? "Provide a TTD API token via the TTD-Auth header."
      : "Provide a valid Bearer token in the Authorization header.",
    sessionServiceStore,
    rateLimiter,
    async createSessionForAuth(authResult, sessionId, appConfig, log) {
      const ttdConfig = appConfig as AppConfig;

      // Case 1: Platform adapter available (ttd-token mode)
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
        ttdConfig.ttdApiToken
      ) {
        const envAdapter = new TtdDirectTokenAuthAdapter(ttdConfig.ttdApiToken, "env-direct-token");
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
            "TTD credentials required. Set TTD_API_TOKEN env var, or use MCP_AUTH_MODE=ttd-token.",
          status: 400 as const,
        },
      };
    },
    async createMcpServer(log, sessionId, gcsBucket) {
      return createMcpServer(log, sessionId, gcsBucket);
    },
    packageJsonPath: new URL("../../../package.json", import.meta.url).pathname,
    serverCard: buildServerCardExtras("ttd-mcp"),
  };
}

export function createMcpHttpServer(
  config: AppConfig,
  logger: Logger
): { app: ReturnType<typeof createMcpHttpTransport>["app"]; shutdown: () => Promise<void> } {
  return createMcpHttpTransport(config, logger, buildPlatformConfig(config, logger));
}

export async function startHttpServer(config: AppConfig, logger: Logger): Promise<McpHttpServer> {
  return startMcpHttpServer(config, logger, buildPlatformConfig(config, logger));
}
