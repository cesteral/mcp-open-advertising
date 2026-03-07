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
  createMcpHttpTransport,
  startMcpHttpServer,
  createAuthStrategy,
  type AuthMode,
  type McpHttpServer,
  type TransportFactoryConfig,
} from "@cesteral/shared";
import { MetaBearerAuthStrategy } from "../../auth/meta-auth-strategy.js";
import type { MetaAuthAdapter } from "../../auth/meta-auth-adapter.js";
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
      "X-Meta-App-Id",
      "X-Meta-App-Secret",
    ],
    authErrorHint:
      config.mcpAuthMode === "meta-bearer"
        ? "Provide a Meta access token via Authorization: Bearer <token> header."
        : "Provide a valid Bearer token in the Authorization header.",
    sessionServiceStore,
    rateLimiter,
    async createSessionForAuth(authResult, sessionId, appConfig, log) {
      // For meta-bearer mode, the adapter is returned via platformAuthAdapter
      const adapter = authResult.platformAuthAdapter as MetaAuthAdapter | undefined;
      if (adapter) {
        const services = createSessionServices(
          adapter,
          (appConfig as AppConfig).metaApiBaseUrl,
          log,
          rateLimiter
        );
        sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
        return { services };
      }

      // For none/jwt modes without a platform adapter, use env var credentials
      if (appConfig.mcpAuthMode === "none" || appConfig.mcpAuthMode === "jwt") {
        const cfg = appConfig as AppConfig;
        const metaToken = cfg.metaAccessToken;

        // Prefer token exchange flow if app credentials are available
        if (metaToken && cfg.metaAppId && cfg.metaAppSecret) {
          const { MetaRefreshTokenAdapter } = await import("../../auth/meta-auth-adapter.js");
          const envAdapter = new MetaRefreshTokenAdapter(
            metaToken,
            { appId: cfg.metaAppId, appSecret: cfg.metaAppSecret },
            cfg.metaApiBaseUrl
          );
          await envAdapter.validate();
          const services = createSessionServices(envAdapter, cfg.metaApiBaseUrl, log, rateLimiter);
          sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
          return { services };
        }

        // Fallback: static access token
        if (metaToken) {
          const { MetaAccessTokenAdapter } = await import("../../auth/meta-auth-adapter.js");
          const envAdapter = new MetaAccessTokenAdapter(metaToken, cfg.metaApiBaseUrl);
          await envAdapter.validate();
          const services = createSessionServices(
            envAdapter,
            (appConfig as AppConfig).metaApiBaseUrl,
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
              message: "Meta access token required. Set META_ACCESS_TOKEN env var, or use MCP_AUTH_MODE=meta-bearer.",
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
          message: "Meta API credentials required for this server.",
          status: 400 as const,
        },
      };
    },
    async createMcpServer(log, sessionId, gcsBucket) {
      return createMcpServer(log, sessionId, gcsBucket);
    },
    packageJsonPath: new URL("../../../package.json", import.meta.url).pathname,
    platformDisplayName: "Meta",
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
