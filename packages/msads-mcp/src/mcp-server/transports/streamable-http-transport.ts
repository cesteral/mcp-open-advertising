/**
 * Streamable HTTP Transport for msads-mcp
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
import { MsAdsBearerAuthStrategy } from "../../auth/msads-auth-strategy.js";
import type { MsAdsAuthAdapter } from "../../auth/msads-auth-adapter.js";
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
      config.mcpAuthMode === "msads-bearer"
        ? new MsAdsBearerAuthStrategy(config.msadsCustomerApiBaseUrl)
        : createAuthStrategy(config.mcpAuthMode as AuthMode, {
            jwtSecret: config.mcpAuthSecretKey,
            logger,
          }),
    corsAllowHeaders: [
      "Content-Type",
      "Authorization",
      "Mcp-Session-Id",
      "MCP-Protocol-Version",
      "X-MSAds-Developer-Token",
      "X-MSAds-Customer-Id",
      "X-MSAds-Account-Id",
    ],
    authErrorHint:
      config.mcpAuthMode === "msads-bearer"
        ? "Provide an OAuth2 access token via Authorization: Bearer <token> header, plus X-MSAds-Developer-Token, X-MSAds-Customer-Id, and X-MSAds-Account-Id headers."
        : "Provide a valid Bearer token in the Authorization header.",
    sessionServiceStore,
    rateLimiter,
    async createSessionForAuth(authResult, sessionId, appConfig, log) {
      const adapter = authResult.platformAuthAdapter as MsAdsAuthAdapter | undefined;
      if (adapter) {
        const cfg = appConfig as AppConfig;
        const services = createSessionServices(
          adapter,
          cfg.msadsCampaignApiBaseUrl,
          cfg.msadsReportingApiBaseUrl,
          log,
          rateLimiter,
          {
            reportPollIntervalMs: cfg.msadsReportPollIntervalMs,
            reportMaxPollAttempts: cfg.msadsReportMaxPollAttempts,
          }
        );
        sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
        return { services };
      }

      // For none/jwt modes without platform adapter, use env var credentials
      if (appConfig.mcpAuthMode === "none" || appConfig.mcpAuthMode === "jwt") {
        const cfg = appConfig as AppConfig;
        const { msadsAccessToken, msadsDeveloperToken, msadsCustomerId, msadsAccountId } = cfg;

        if (msadsAccessToken && msadsDeveloperToken && msadsCustomerId && msadsAccountId) {
          const { MsAdsAccessTokenAdapter } = await import("../../auth/msads-auth-adapter.js");
          const envAdapter = new MsAdsAccessTokenAdapter(
            msadsAccessToken,
            msadsDeveloperToken,
            msadsCustomerId,
            msadsAccountId,
            cfg.msadsCustomerApiBaseUrl
          );
          await envAdapter.validate();
          const services = createSessionServices(
            envAdapter,
            cfg.msadsCampaignApiBaseUrl,
            cfg.msadsReportingApiBaseUrl,
            log,
            rateLimiter,
            {
              reportPollIntervalMs: cfg.msadsReportPollIntervalMs,
              reportMaxPollAttempts: cfg.msadsReportMaxPollAttempts,
            }
          );
          sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
          return { services };
        }

        if (appConfig.mcpAuthMode !== "none") {
          return {
            services: null,
            error: {
              message: "Microsoft Ads credentials required. Set MSADS_ACCESS_TOKEN, MSADS_DEVELOPER_TOKEN, MSADS_CUSTOMER_ID, and MSADS_ACCOUNT_ID env vars, or use MCP_AUTH_MODE=msads-bearer.",
              status: 400 as const,
            },
          };
        }
        return { services: null };
      }

      return {
        services: null,
        error: {
          message: "Microsoft Ads API credentials required for this server.",
          status: 400 as const,
        },
      };
    },
    async createMcpServer(log, sessionId, gcsBucket) {
      return createMcpServer(log, sessionId, gcsBucket);
    },
    packageJsonPath: new URL("../../../package.json", import.meta.url).pathname,
    platformDisplayName: "Microsoft Ads",
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
