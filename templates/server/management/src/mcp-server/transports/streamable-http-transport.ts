// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/** Streamable HTTP transport for {{package}}, via the shared transport factory. */

import type { Logger } from "pino";
import type { AppConfig } from "../../config/index.js";
import { createMcpServer } from "../server.js";
import {
  createAuthStrategy,
  type AuthMode,
  type TransportFactoryConfig,
  buildServerCardExtras,
  createTransportEntrypoints,
} from "@cesteral/shared";
import { {{Pascal}}BearerAuthStrategy } from "../../auth/{{key}}-auth-strategy.js";
import type { {{Pascal}}AuthAdapter } from "../../auth/{{key}}-auth-adapter.js";
import { createSessionServices, sessionServiceStore } from "../../services/session-services.js";
import { rateLimiter } from "../../utils/platform.js";
import { {{ENV}}_RETRY_CONFIG } from "../../services/{{key}}/{{key}}-http-client.js";

function buildPlatformConfig(config: AppConfig, logger: Logger): TransportFactoryConfig {
  return {
    authStrategy:
      config.mcpAuthMode === "{{key}}-bearer"
        ? new {{Pascal}}BearerAuthStrategy(config.apiBaseUrl, logger)
        : createAuthStrategy(config.mcpAuthMode as AuthMode, {
            jwtSecret: config.mcpAuthSecretKey,
            logger,
          }),
    corsAllowHeaders: [
      "Content-Type",
      "Authorization",
      "Mcp-Session-Id",
      "MCP-Protocol-Version",
      "X-Cesteral-Decision-Token",
      "X-{{Pascal}}-Account-Id",
    ],
    authErrorHint:
      config.mcpAuthMode === "{{key}}-bearer"
        ? "Provide a {{displayName}} access token via Authorization: Bearer <token> and the account ID via X-{{Pascal}}-Account-Id."
        : "Provide a valid Bearer token in the Authorization header.",
    sessionServiceStore,
    rateLimiter,
    // The server card publishes the retry policy callers actually meet.
    retryDescriptor: { maxRetries: {{ENV}}_RETRY_CONFIG.maxRetries },
    async createSessionForAuth(authResult, sessionId, appConfig, log) {
      const cfg = appConfig as AppConfig;
      const adapter = authResult.platformAuthAdapter as {{Pascal}}AuthAdapter | undefined;
      if (adapter) {
        const services = createSessionServices(adapter, { baseUrl: cfg.apiBaseUrl }, log, rateLimiter);
        sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
        return { services };
      }

      // jwt / none: credentials from env vars
      if (cfg.mcpAuthMode === "none" || cfg.mcpAuthMode === "jwt") {
        if (cfg.accessToken && cfg.accountId) {
          const { {{Pascal}}AccessTokenAdapter } = await import("../../auth/{{key}}-auth-adapter.js");
          const envAdapter = new {{Pascal}}AccessTokenAdapter(
            cfg.accessToken,
            cfg.accountId,
            cfg.apiBaseUrl
          );
          await envAdapter.validate();
          const services = createSessionServices(
            envAdapter,
            { baseUrl: cfg.apiBaseUrl },
            log,
            rateLimiter
          );
          sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
          return { services };
        }
        if (cfg.mcpAuthMode !== "none") {
          return {
            services: null,
            error: {
              message:
                "{{displayName}} access token and account ID required. Set {{ENV}}_ACCESS_TOKEN and {{ENV}}_ACCOUNT_ID, or use MCP_AUTH_MODE={{key}}-bearer.",
              status: 400 as const,
            },
          };
        }
        // none without credentials: protocol-only session (tools fail at runtime)
        return { services: null };
      }

      return {
        services: null,
        error: { message: "{{displayName}} API credentials required.", status: 400 as const },
      };
    },
    async createMcpServer(log, sessionId, gcsBucket) {
      return createMcpServer(log, sessionId, gcsBucket);
    },
    packageJsonPath: new URL("../../../package.json", import.meta.url).pathname,
    serverCard: buildServerCardExtras("{{package}}"),
  };
}

export const { createMcpHttpServer, startHttpServer } =
  createTransportEntrypoints<AppConfig>(buildPlatformConfig);
