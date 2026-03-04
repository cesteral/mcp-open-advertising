/**
 * Streamable HTTP Transport for LinkedIn-MCP
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
import { LinkedInBearerAuthStrategy } from "../../auth/linkedin-auth-strategy.js";
import type { LinkedInAuthAdapter } from "../../auth/linkedin-auth-adapter.js";
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
      config.mcpAuthMode === "linkedin-bearer"
        ? new LinkedInBearerAuthStrategy(config.linkedinApiBaseUrl, config.linkedinApiVersion, logger)
        : createAuthStrategy(config.mcpAuthMode as AuthMode, {
            jwtSecret: config.mcpAuthSecretKey,
            logger,
          }),
    corsAllowHeaders: [
      "Content-Type",
      "Authorization",
      "Mcp-Session-Id",
      "MCP-Protocol-Version",
    ],
    authErrorHint:
      config.mcpAuthMode === "linkedin-bearer"
        ? "Provide a LinkedIn access token via Authorization: Bearer <token> header."
        : "Provide a valid Bearer token in the Authorization header.",
    sessionServiceStore,
    rateLimiter,
    async createSessionForAuth(authResult, sessionId, appConfig, log) {
      // For linkedin-bearer mode, the adapter is returned via platformAuthAdapter
      const adapter = authResult.platformAuthAdapter as LinkedInAuthAdapter | undefined;
      if (adapter) {
        const services = createSessionServices(
          adapter,
          (appConfig as AppConfig).linkedinApiBaseUrl,
          (appConfig as AppConfig).linkedinApiVersion,
          log,
          rateLimiter
        );
        sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
        return { services };
      }

      // For none/jwt modes without a platform adapter, use env var token if available
      if (appConfig.mcpAuthMode === "none" || appConfig.mcpAuthMode === "jwt") {
        const linkedInToken = (appConfig as AppConfig).linkedinAccessToken;
        if (linkedInToken) {
          const { LinkedInAccessTokenAdapter } = await import("../../auth/linkedin-auth-adapter.js");
          const envAdapter = new LinkedInAccessTokenAdapter(
            linkedInToken,
            (appConfig as AppConfig).linkedinApiBaseUrl,
            (appConfig as AppConfig).linkedinApiVersion
          );
          await envAdapter.validate();
          const services = createSessionServices(
            envAdapter,
            (appConfig as AppConfig).linkedinApiBaseUrl,
            (appConfig as AppConfig).linkedinApiVersion,
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
                "LinkedIn access token required. Set LINKEDIN_ACCESS_TOKEN env var, or use MCP_AUTH_MODE=linkedin-bearer.",
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
          message: "LinkedIn API credentials required for this server.",
          status: 400 as const,
        },
      };
    },
    async createMcpServer(log, sessionId, gcsBucket) {
      return createMcpServer(log, sessionId, gcsBucket);
    },
    packageJsonPath: new URL("../../../package.json", import.meta.url).pathname,
    platformDisplayName: "LinkedIn",
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
