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
  createMcpHttpTransport,
  startMcpHttpServer,
  createAuthStrategy,
  type AuthMode,
  type McpHttpServer,
  type TransportFactoryConfig,
} from "@cesteral/shared";
import { AmazonDspBearerAuthStrategy } from "../../auth/amazon-dsp-auth-strategy.js";
import type { AmazonDspAuthAdapter } from "../../auth/amazon-dsp-auth-adapter.js";
import {
  createSessionServices,
  sessionServiceStore,
} from "../../services/session-services.js";
import { rateLimiter } from "../../utils/security/rate-limiter.js";

function buildPlatformConfig(
  config: AppConfig,
  logger: Logger
): TransportFactoryConfig {
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
      "Amazon-Advertising-API-Scope",
      "Amazon-Advertising-API-ClientId",
      "X-AmazonDsp-App-Id",
      "X-AmazonDsp-App-Secret",
      "X-AmazonDsp-Refresh-Token",
    ],
    authErrorHint:
      config.mcpAuthMode === "amazon-dsp-bearer"
        ? "Provide an Amazon access token via Authorization: Bearer <token>, profile ID via Amazon-Advertising-API-Scope, and client ID via Amazon-Advertising-API-ClientId."
        : "Provide a valid Bearer token in the Authorization header.",
    sessionServiceStore,
    rateLimiter,
    async createSessionForAuth(authResult, sessionId, appConfig, log) {
      // For amazon-dsp-bearer mode, the adapter is returned via platformAuthAdapter
      const adapter = authResult.platformAuthAdapter as AmazonDspAuthAdapter | undefined;
      if (adapter) {
        const cfg = appConfig as AppConfig;
        const services = createSessionServices(
          adapter,
          { baseUrl: cfg.amazonDspApiBaseUrl, reportPollIntervalMs: cfg.amazonDspReportPollIntervalMs, reportMaxPollAttempts: cfg.amazonDspReportMaxPollAttempts, clientId: adapter.clientId || cfg.amazonDspClientId },
          log,
          rateLimiter
        );
        sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
        return { services };
      }

      // For none/jwt modes without a platform adapter, use env var credentials
      if (appConfig.mcpAuthMode === "none" || appConfig.mcpAuthMode === "jwt") {
        const cfg = appConfig as AppConfig;
        const amazonDspProfileId = cfg.amazonDspProfileId;

        // Prefer refresh token flow if app credentials are available
        if (cfg.amazonDspAppId && cfg.amazonDspAppSecret && cfg.amazonDspRefreshToken && amazonDspProfileId) {
          const { AmazonDspRefreshTokenAdapter } = await import("../../auth/amazon-dsp-auth-adapter.js");
          const envAdapter = new AmazonDspRefreshTokenAdapter(
            { appId: cfg.amazonDspAppId, appSecret: cfg.amazonDspAppSecret, refreshToken: cfg.amazonDspRefreshToken },
            amazonDspProfileId,
            cfg.amazonDspApiBaseUrl
          );
          await envAdapter.validate();
          const services = createSessionServices(envAdapter, { baseUrl: cfg.amazonDspApiBaseUrl, reportPollIntervalMs: cfg.amazonDspReportPollIntervalMs, reportMaxPollAttempts: cfg.amazonDspReportMaxPollAttempts, clientId: cfg.amazonDspClientId }, log, rateLimiter);
          sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
          return { services };
        }

        // Fallback: static access token
        const amazonDspToken = cfg.amazonDspAccessToken;
        if (amazonDspToken && amazonDspProfileId) {
          const { AmazonDspAccessTokenAdapter } = await import("../../auth/amazon-dsp-auth-adapter.js");
          const envAdapter = new AmazonDspAccessTokenAdapter(
            amazonDspToken,
            amazonDspProfileId,
            cfg.amazonDspApiBaseUrl
          );
          await envAdapter.validate();
          const cfgFallback = appConfig as AppConfig;
          const services = createSessionServices(
            envAdapter,
            { baseUrl: cfgFallback.amazonDspApiBaseUrl, reportPollIntervalMs: cfgFallback.amazonDspReportPollIntervalMs, reportMaxPollAttempts: cfgFallback.amazonDspReportMaxPollAttempts, clientId: cfgFallback.amazonDspClientId },
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
              message: "Amazon DSP access token and profile ID required. Set AMAZON_DSP_ACCESS_TOKEN and AMAZON_DSP_PROFILE_ID env vars, or use MCP_AUTH_MODE=amazon-dsp-bearer.",
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
          message: "AmazonDsp API credentials required for this server.",
          status: 400 as const,
        },
      };
    },
    async createMcpServer(log, sessionId, gcsBucket) {
      return createMcpServer(log, sessionId, gcsBucket);
    },
    packageJsonPath: new URL("../../../package.json", import.meta.url).pathname,
    platformDisplayName: "AmazonDsp",
    serverCard: {
      description: "Amazon DSP: orders, line items, creatives, reporting.",
      platform: "Amazon DSP",
      supportedAuthModes: ["amazon-dsp-bearer", "jwt", "none"],
      documentationUrl: "https://advertising.amazon.com/API/docs/en-us/",
    },
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