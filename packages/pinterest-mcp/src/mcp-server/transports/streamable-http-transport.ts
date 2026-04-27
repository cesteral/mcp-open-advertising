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
  createMcpHttpTransport,
  startMcpHttpServer,
  createAuthStrategy,
  type AuthMode,
  type McpHttpServer,
  type TransportFactoryConfig,
  buildServerCardExtras,
} from "@cesteral/shared";
import { PinterestBearerAuthStrategy } from "../../auth/pinterest-auth-strategy.js";
import type { PinterestAuthAdapter } from "../../auth/pinterest-auth-adapter.js";
import { createSessionServices, sessionServiceStore } from "../../services/session-services.js";
import { rateLimiter } from "../../utils/security/rate-limiter.js";

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
    async createSessionForAuth(authResult, sessionId, appConfig, log) {
      // For pinterest-bearer mode, the adapter is returned via platformAuthAdapter
      const adapter = authResult.platformAuthAdapter as PinterestAuthAdapter | undefined;
      if (adapter) {
        const cfg = appConfig as AppConfig;
        const services = createSessionServices(
          adapter,
          {
            baseUrl: cfg.pinterestApiBaseUrl,
            apiVersion: cfg.pinterestApiVersion,
            reportPollIntervalMs: cfg.pinterestReportPollIntervalMs,
            reportMaxPollAttempts: cfg.pinterestReportMaxPollAttempts,
          },
          log,
          rateLimiter
        );
        sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
        return { services };
      }

      // For none/jwt modes without a platform adapter, use env var credentials
      if (appConfig.mcpAuthMode === "none" || appConfig.mcpAuthMode === "jwt") {
        const cfg = appConfig as AppConfig;
        const pinterestAdAccountId = cfg.pinterestAdAccountId;

        // Prefer refresh token flow if app credentials are available
        if (
          cfg.pinterestAppId &&
          cfg.pinterestAppSecret &&
          cfg.pinterestRefreshToken &&
          pinterestAdAccountId
        ) {
          const { PinterestRefreshTokenAdapter } = await import(
            "../../auth/pinterest-auth-adapter.js"
          );
          const envAdapter = new PinterestRefreshTokenAdapter(
            {
              appId: cfg.pinterestAppId,
              appSecret: cfg.pinterestAppSecret,
              refreshToken: cfg.pinterestRefreshToken,
            },
            pinterestAdAccountId,
            cfg.pinterestApiBaseUrl
          );
          await envAdapter.validate();
          const services = createSessionServices(
            envAdapter,
            {
              baseUrl: cfg.pinterestApiBaseUrl,
              apiVersion: cfg.pinterestApiVersion,
              reportPollIntervalMs: cfg.pinterestReportPollIntervalMs,
              reportMaxPollAttempts: cfg.pinterestReportMaxPollAttempts,
            },
            log,
            rateLimiter
          );
          sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
          return { services };
        }

        // Fallback: static access token
        const pinterestToken = cfg.pinterestAccessToken;
        if (pinterestToken && pinterestAdAccountId) {
          const { PinterestAccessTokenAdapter } = await import(
            "../../auth/pinterest-auth-adapter.js"
          );
          const envAdapter = new PinterestAccessTokenAdapter(
            pinterestToken,
            pinterestAdAccountId,
            cfg.pinterestApiBaseUrl
          );
          await envAdapter.validate();
          const cfgFallback = appConfig as AppConfig;
          const services = createSessionServices(
            envAdapter,
            {
              baseUrl: cfgFallback.pinterestApiBaseUrl,
              apiVersion: cfgFallback.pinterestApiVersion,
              reportPollIntervalMs: cfgFallback.pinterestReportPollIntervalMs,
              reportMaxPollAttempts: cfgFallback.pinterestReportMaxPollAttempts,
            },
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
                "Pinterest access token and ad account ID required. Set PINTEREST_ACCESS_TOKEN and PINTEREST_AD_ACCOUNT_ID env vars, or use MCP_AUTH_MODE=pinterest-bearer.",
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
          message: "Pinterest API credentials required for this server.",
          status: 400 as const,
        },
      };
    },
    async createMcpServer(log, sessionId, gcsBucket) {
      return createMcpServer(log, sessionId, gcsBucket);
    },
    packageJsonPath: new URL("../../../package.json", import.meta.url).pathname,
    serverCard: buildServerCardExtras("pinterest-mcp"),
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
