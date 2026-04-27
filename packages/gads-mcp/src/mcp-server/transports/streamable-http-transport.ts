// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Streamable HTTP Transport for GAds-MCP
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
import { GAdsHeadersAuthStrategy } from "../../auth/gads-auth-strategy.js";
import type { GAdsAuthAdapter } from "../../auth/gads-auth-adapter.js";
import { createSessionServices, sessionServiceStore } from "../../services/session-services.js";
import { rateLimiter } from "../../utils/security/rate-limiter.js";

function buildPlatformConfig(config: AppConfig, logger: Logger): TransportFactoryConfig {
  return {
    authStrategy:
      config.mcpAuthMode === "gads-headers"
        ? new GAdsHeadersAuthStrategy(logger)
        : createAuthStrategy(config.mcpAuthMode as AuthMode, {
            jwtSecret: config.mcpAuthSecretKey,
            logger,
          }),
    corsAllowHeaders: [
      "Content-Type",
      "Authorization",
      "Mcp-Session-Id",
      "MCP-Protocol-Version",
      "X-GAds-Developer-Token",
      "X-GAds-Client-Id",
      "X-GAds-Client-Secret",
      "X-GAds-Refresh-Token",
      "X-GAds-Login-Customer-Id",
    ],
    authErrorHint:
      config.mcpAuthMode === "gads-headers"
        ? "Provide Google Ads credentials via X-GAds-Developer-Token, X-GAds-Client-Id, X-GAds-Client-Secret, and X-GAds-Refresh-Token headers."
        : "Provide a valid Bearer token in the Authorization header.",
    sessionServiceStore,
    rateLimiter,
    async createSessionForAuth(authResult, sessionId, appConfig, log) {
      const adapter = authResult.platformAuthAdapter as GAdsAuthAdapter | undefined;
      if (adapter) {
        await adapter.validate();
        const services = createSessionServices(
          adapter,
          { baseUrl: (appConfig as AppConfig).gadsApiBaseUrl },
          log,
          rateLimiter
        );
        sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
        return { services };
      }

      // For none/jwt modes without a platform adapter, use env var creds if available
      if (appConfig.mcpAuthMode === "none" || appConfig.mcpAuthMode === "jwt") {
        const typedConfig = appConfig as AppConfig;
        if (
          typedConfig.gadsDeveloperToken &&
          typedConfig.gadsClientId &&
          typedConfig.gadsClientSecret &&
          typedConfig.gadsRefreshToken
        ) {
          const { GAdsRefreshTokenAuthAdapter } = await import("../../auth/gads-auth-adapter.js");
          const envAdapter = new GAdsRefreshTokenAuthAdapter({
            developerToken: typedConfig.gadsDeveloperToken,
            clientId: typedConfig.gadsClientId,
            clientSecret: typedConfig.gadsClientSecret,
            refreshToken: typedConfig.gadsRefreshToken,
            loginCustomerId: typedConfig.gadsLoginCustomerId,
          });
          await envAdapter.validate();
          const services = createSessionServices(
            envAdapter,
            { baseUrl: typedConfig.gadsApiBaseUrl },
            log,
            rateLimiter
          );
          sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
          return { services };
        }

        if (appConfig.mcpAuthMode !== "none") {
          return {
            services: null,
            error: {
              message:
                "Google Ads credentials required. Set GADS_DEVELOPER_TOKEN, GADS_CLIENT_ID, GADS_CLIENT_SECRET, and GADS_REFRESH_TOKEN env vars, or use MCP_AUTH_MODE=gads-headers.",
              status: 400 as const,
            },
          };
        }

        // none auth without credentials — protocol-only session (tools will fail at runtime)
        return { services: null };
      }

      return {
        services: null,
        error: {
          message: "Google Ads API credentials required for this server.",
          status: 400 as const,
        },
      };
    },
    async createMcpServer(log, sessionId, gcsBucket) {
      return createMcpServer(log, sessionId, gcsBucket);
    },
    packageJsonPath: new URL("../../../package.json", import.meta.url).pathname,
    serverCard: buildServerCardExtras("gads-mcp"),
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
