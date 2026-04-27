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
  createMcpHttpTransport,
  startMcpHttpServer,
  createAuthStrategy,
  type AuthMode,
  type McpHttpServer,
  type TransportFactoryConfig,
  buildServerCardExtras,
} from "@cesteral/shared";
import { TikTokBearerAuthStrategy } from "../../auth/tiktok-auth-strategy.js";
import type { TikTokAuthAdapter } from "../../auth/tiktok-auth-adapter.js";
import { createSessionServices, sessionServiceStore } from "../../services/session-services.js";
import { rateLimiter } from "../../utils/security/rate-limiter.js";

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
    async createSessionForAuth(authResult, sessionId, appConfig, log) {
      // For tiktok-bearer mode, the adapter is returned via platformAuthAdapter
      const adapter = authResult.platformAuthAdapter as TikTokAuthAdapter | undefined;
      if (adapter) {
        const cfg = appConfig as AppConfig;
        const services = createSessionServices(
          adapter,
          {
            baseUrl: cfg.tiktokApiBaseUrl,
            reportPollIntervalMs: cfg.tiktokReportPollIntervalMs,
            reportMaxPollAttempts: cfg.tiktokReportMaxPollAttempts,
            apiVersion: cfg.tiktokApiVersion,
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
        const tiktokAdvertiserId = cfg.tiktokAdvertiserId;

        // Prefer refresh token flow if app credentials are available
        if (
          cfg.tiktokAppId &&
          cfg.tiktokAppSecret &&
          cfg.tiktokRefreshToken &&
          tiktokAdvertiserId
        ) {
          const { TikTokRefreshTokenAdapter } = await import("../../auth/tiktok-auth-adapter.js");
          const envAdapter = new TikTokRefreshTokenAdapter(
            {
              appId: cfg.tiktokAppId,
              appSecret: cfg.tiktokAppSecret,
              refreshToken: cfg.tiktokRefreshToken,
            },
            tiktokAdvertiserId,
            cfg.tiktokApiBaseUrl,
            cfg.tiktokApiVersion
          );
          await envAdapter.validate();
          const services = createSessionServices(
            envAdapter,
            {
              baseUrl: cfg.tiktokApiBaseUrl,
              reportPollIntervalMs: cfg.tiktokReportPollIntervalMs,
              reportMaxPollAttempts: cfg.tiktokReportMaxPollAttempts,
              apiVersion: cfg.tiktokApiVersion,
            },
            log,
            rateLimiter
          );
          sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
          return { services };
        }

        // Fallback: static access token
        const tiktokToken = cfg.tiktokAccessToken;
        if (tiktokToken && tiktokAdvertiserId) {
          const { TikTokAccessTokenAdapter } = await import("../../auth/tiktok-auth-adapter.js");
          const envAdapter = new TikTokAccessTokenAdapter(
            tiktokToken,
            tiktokAdvertiserId,
            cfg.tiktokApiBaseUrl,
            cfg.tiktokApiVersion
          );
          await envAdapter.validate();
          const cfgFallback = appConfig as AppConfig;
          const services = createSessionServices(
            envAdapter,
            {
              baseUrl: cfgFallback.tiktokApiBaseUrl,
              reportPollIntervalMs: cfgFallback.tiktokReportPollIntervalMs,
              reportMaxPollAttempts: cfgFallback.tiktokReportMaxPollAttempts,
              apiVersion: cfgFallback.tiktokApiVersion,
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
                "TikTok access token and advertiser ID required. Set TIKTOK_ACCESS_TOKEN and TIKTOK_ADVERTISER_ID env vars, or use MCP_AUTH_MODE=tiktok-bearer.",
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
          message: "TikTok API credentials required for this server.",
          status: 400 as const,
        },
      };
    },
    async createMcpServer(log, sessionId, gcsBucket) {
      return createMcpServer(log, sessionId, gcsBucket);
    },
    packageJsonPath: new URL("../../../package.json", import.meta.url).pathname,
    serverCard: buildServerCardExtras("tiktok-mcp"),
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
