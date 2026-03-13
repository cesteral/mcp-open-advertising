/**
 * Streamable HTTP Transport for Snapchat-MCP
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
import { SnapchatBearerAuthStrategy } from "../../auth/snapchat-auth-strategy.js";
import type { SnapchatAuthAdapter } from "../../auth/snapchat-auth-adapter.js";
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
      config.mcpAuthMode === "snapchat-bearer"
        ? new SnapchatBearerAuthStrategy(config.snapchatApiBaseUrl, logger)
        : createAuthStrategy(config.mcpAuthMode as AuthMode, {
            jwtSecret: config.mcpAuthSecretKey,
            logger,
          }),
    corsAllowHeaders: [
      "Content-Type",
      "Authorization",
      "Mcp-Session-Id",
      "MCP-Protocol-Version",
      "X-Snapchat-Ad-Account-Id",
      "X-Snapchat-App-Id",
      "X-Snapchat-App-Secret",
      "X-Snapchat-Refresh-Token",
    ],
    authErrorHint:
      config.mcpAuthMode === "snapchat-bearer"
        ? "Provide a Snapchat access token via Authorization: Bearer <token> header and ad account ID via X-Snapchat-Ad-Account-Id header."
        : "Provide a valid Bearer token in the Authorization header.",
    sessionServiceStore,
    rateLimiter,
    async createSessionForAuth(authResult, sessionId, appConfig, log) {
      // For snapchat-bearer mode, the adapter is returned via platformAuthAdapter
      const adapter = authResult.platformAuthAdapter as SnapchatAuthAdapter | undefined;
      if (adapter) {
        const cfg = appConfig as AppConfig;
        const services = createSessionServices(
          adapter,
          cfg.snapchatApiBaseUrl,
          log,
          rateLimiter,
          { reportPollIntervalMs: cfg.snapchatReportPollIntervalMs, reportMaxPollAttempts: cfg.snapchatReportMaxPollAttempts }
        );
        sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
        return { services };
      }

      // For none/jwt modes without a platform adapter, use env var credentials
      if (appConfig.mcpAuthMode === "none" || appConfig.mcpAuthMode === "jwt") {
        const cfg = appConfig as AppConfig;
        const snapchatAdAccountId = cfg.snapchatAdAccountId;

        // Prefer refresh token flow if app credentials are available
        if (cfg.snapchatAppId && cfg.snapchatAppSecret && cfg.snapchatRefreshToken && snapchatAdAccountId) {
          const { SnapchatRefreshTokenAdapter } = await import("../../auth/snapchat-auth-adapter.js");
          const envAdapter = new SnapchatRefreshTokenAdapter(
            { appId: cfg.snapchatAppId, appSecret: cfg.snapchatAppSecret, refreshToken: cfg.snapchatRefreshToken },
            snapchatAdAccountId,
            cfg.snapchatApiBaseUrl,
            cfg.snapchatOrgId ?? ""
          );
          await envAdapter.validate();
          const services = createSessionServices(envAdapter, cfg.snapchatApiBaseUrl, log, rateLimiter, { reportPollIntervalMs: cfg.snapchatReportPollIntervalMs, reportMaxPollAttempts: cfg.snapchatReportMaxPollAttempts });
          sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
          return { services };
        }

        // Fallback: static access token
        const snapchatToken = cfg.snapchatAccessToken;
        if (snapchatToken && snapchatAdAccountId) {
          const { SnapchatAccessTokenAdapter } = await import("../../auth/snapchat-auth-adapter.js");
          const envAdapter = new SnapchatAccessTokenAdapter(
            snapchatToken,
            snapchatAdAccountId,
            cfg.snapchatApiBaseUrl,
            cfg.snapchatOrgId ?? ""
          );
          await envAdapter.validate();
          const cfgFallback = appConfig as AppConfig;
          const services = createSessionServices(
            envAdapter,
            cfgFallback.snapchatApiBaseUrl,
            log,
            rateLimiter,
            { reportPollIntervalMs: cfgFallback.snapchatReportPollIntervalMs, reportMaxPollAttempts: cfgFallback.snapchatReportMaxPollAttempts }
          );
          sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
          return { services };
        }
        if (appConfig.mcpAuthMode !== "none") {
          return {
            services: null,
            error: {
              message: "Snapchat access token and ad account ID required. Set SNAPCHAT_ACCESS_TOKEN and SNAPCHAT_AD_ACCOUNT_ID env vars, or use MCP_AUTH_MODE=snapchat-bearer.",
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
          message: "Snapchat API credentials required for this server.",
          status: 400 as const,
        },
      };
    },
    async createMcpServer(log, sessionId, gcsBucket) {
      return createMcpServer(log, sessionId, gcsBucket);
    },
    packageJsonPath: new URL("../../../package.json", import.meta.url).pathname,
    platformDisplayName: "Snapchat",
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
