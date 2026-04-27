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
  createMcpHttpTransport,
  startMcpHttpServer,
  createAuthStrategy,
  type AuthMode,
  type McpHttpServer,
  type TransportFactoryConfig,
  buildServerCardExtras,
} from "@cesteral/shared";
import { SA360HeadersAuthStrategy } from "../../auth/sa360-auth-strategy.js";
import type { SA360AuthAdapter } from "../../auth/sa360-auth-adapter.js";
import { createSessionServices, sessionServiceStore } from "../../services/session-services.js";
import { rateLimiter } from "../../utils/security/rate-limiter.js";

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
    async createSessionForAuth(authResult, sessionId, appConfig, log) {
      const adapter = authResult.platformAuthAdapter as SA360AuthAdapter | undefined;
      if (adapter) {
        await adapter.validate();
        const services = createSessionServices(
          adapter,
          {
            baseUrl: (appConfig as AppConfig).sa360ApiBaseUrl,
            v2BaseUrl: (appConfig as AppConfig).sa360V2ApiBaseUrl,
          },
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
          typedConfig.sa360ClientId &&
          typedConfig.sa360ClientSecret &&
          typedConfig.sa360RefreshToken
        ) {
          const { SA360RefreshTokenAuthAdapter } = await import("../../auth/sa360-auth-adapter.js");
          const envAdapter = new SA360RefreshTokenAuthAdapter({
            clientId: typedConfig.sa360ClientId,
            clientSecret: typedConfig.sa360ClientSecret,
            refreshToken: typedConfig.sa360RefreshToken,
            loginCustomerId: typedConfig.sa360LoginCustomerId,
          });
          await envAdapter.validate();
          const services = createSessionServices(
            envAdapter,
            { baseUrl: typedConfig.sa360ApiBaseUrl, v2BaseUrl: typedConfig.sa360V2ApiBaseUrl },
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
                "SA360 credentials required. Set SA360_CLIENT_ID, SA360_CLIENT_SECRET, and SA360_REFRESH_TOKEN env vars, or use MCP_AUTH_MODE=sa360-headers.",
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
          message: "SA360 API credentials required for this server.",
          status: 400 as const,
        },
      };
    },
    async createMcpServer(log, sessionId, gcsBucket) {
      return createMcpServer(log, sessionId, gcsBucket);
    },
    packageJsonPath: new URL("../../../package.json", import.meta.url).pathname,
    serverCard: buildServerCardExtras("sa360-mcp"),
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
