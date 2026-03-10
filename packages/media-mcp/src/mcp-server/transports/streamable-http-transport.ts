/**
 * Streamable HTTP Transport for media-mcp
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
import { SupabaseBearerAuthStrategy } from "../../auth/supabase-auth-strategy.js";
import type { SupabaseAuthAdapterInterface } from "../../auth/supabase-auth-adapter.js";
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
      config.mcpAuthMode === "supabase-bearer"
        ? new SupabaseBearerAuthStrategy(logger)
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
      config.mcpAuthMode === "supabase-bearer"
        ? "Provide your Supabase service role key via Authorization: Bearer <key> header."
        : "Provide a valid Bearer token in the Authorization header.",
    sessionServiceStore,
    rateLimiter,
    async createSessionForAuth(authResult, sessionId, _appConfig, log) {
      const adapter = authResult.platformAuthAdapter as SupabaseAuthAdapterInterface | undefined;
      if (adapter) {
        const services = createSessionServices(adapter, log, rateLimiter);
        sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
        return { services };
      }

      if (config.mcpAuthMode === "none" || config.mcpAuthMode === "jwt") {
        const supabaseUrl = config.supabaseUrl;
        const serviceRoleKey = config.supabaseServiceRoleKey;
        if (supabaseUrl && serviceRoleKey) {
          const { SupabaseAuthAdapter } = await import("../../auth/supabase-auth-adapter.js");
          const envAdapter = new SupabaseAuthAdapter(supabaseUrl, serviceRoleKey);
          await envAdapter.validate();
          const services = createSessionServices(envAdapter, log, rateLimiter);
          sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
          return { services };
        }
        if (config.mcpAuthMode !== "none") {
          return {
            services: null,
            error: {
              message: "Supabase credentials required. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
              status: 400 as const,
            },
          };
        }
        return { services: null };
      }

      return {
        services: null,
        error: {
          message: "Supabase credentials required for this server.",
          status: 400 as const,
        },
      };
    },
    async createMcpServer(log, sessionId, gcsBucket) {
      return createMcpServer(log, sessionId, gcsBucket);
    },
    packageJsonPath: new URL("../../../package.json", import.meta.url).pathname,
    platformDisplayName: "Supabase Media Library",
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
