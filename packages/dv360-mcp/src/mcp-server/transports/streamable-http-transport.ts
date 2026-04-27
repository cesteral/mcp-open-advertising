// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Streamable HTTP Transport for DV360-MCP
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
  type GoogleAuthAdapter,
  type McpHttpServer,
  type TransportFactoryConfig,
  buildServerCardExtras,
} from "@cesteral/shared";
import { createSessionServices, sessionServiceStore } from "../../services/session-services.js";
import { rateLimiter } from "../../utils/security/rate-limiter.js";

function buildPlatformConfig(config: AppConfig, logger: Logger): TransportFactoryConfig {
  return {
    authStrategy: createAuthStrategy(config.mcpAuthMode as AuthMode, {
      scopes: ["https://www.googleapis.com/auth/display-video"],
      jwtSecret: config.mcpAuthSecretKey,
      logger,
    }),
    corsAllowHeaders: [
      "Content-Type",
      "Authorization",
      "Mcp-Session-Id",
      "MCP-Protocol-Version",
      "X-Google-Auth-Type",
      "X-Google-Credentials",
      "X-Google-Client-Id",
      "X-Google-Client-Secret",
      "X-Google-Refresh-Token",
    ],
    authErrorHint:
      config.mcpAuthMode === "google-headers"
        ? "Provide Google credentials via X-Google-Auth-Type and associated headers."
        : "Provide a valid Bearer token in the Authorization header.",
    sessionServiceStore,
    rateLimiter,
    async createSessionForAuth(authResult, sessionId, appConfig, log) {
      const adapter = authResult.googleAuthAdapter as GoogleAuthAdapter | undefined;
      if (adapter) {
        await adapter.validate();
        const services = createSessionServices(
          adapter,
          { baseUrl: (appConfig as AppConfig).dv360ApiBaseUrl },
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
              "Google API credentials required for this server. Use MCP_AUTH_MODE=google-headers.",
            status: 400,
          },
        };
      }
      // none auth without credentials — protocol-only session
      return { services: null };
    },
    async createMcpServer(log, sessionId, gcsBucket) {
      return createMcpServer(log, sessionId, gcsBucket);
    },
    packageJsonPath: new URL("../../../package.json", import.meta.url).pathname,
    serverCard: buildServerCardExtras("dv360-mcp"),
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
