#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { mcpConfig } from "./config/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "@cesteral/shared";
import { createSnapchatEnvAuthAdapter } from "./auth/snapchat-auth-adapter.js";
import { detectTransportMode, createServerLogger, bootstrapMcpServer } from "@cesteral/shared";
import { createSessionServices, sessionServiceStore } from "./services/session-services.js";
import { rateLimiter } from "./utils/platform.js";
import { allTools } from "./mcp-server/tools/definitions/index.js";

const transportMode = detectTransportMode();
const logger = createServerLogger("snapchat-mcp", transportMode, otelLogMixin());

/**
 * Set up credentials for stdio mode from environment variables.
 * Prefers the refresh-token flow (SNAPCHAT_APP_ID/_APP_SECRET/_REFRESH_TOKEN),
 * falling back to a static SNAPCHAT_ACCESS_TOKEN, and creates session services
 * for the "stdio" session.
 */
async function setupStdioCredentials(sessionId: string): Promise<boolean> {
  const authAdapter = createSnapchatEnvAuthAdapter({
    baseUrl: mcpConfig.snapchatApiBaseUrl,
    adAccountId: mcpConfig.snapchatAdAccountId,
    orgId: mcpConfig.snapchatOrgId,
    accessToken: mcpConfig.snapchatAccessToken,
    appId: mcpConfig.snapchatAppId,
    appSecret: mcpConfig.snapchatAppSecret,
    refreshToken: mcpConfig.snapchatRefreshToken,
  });

  if (!authAdapter) {
    logger.warn(
      "No Snapchat credentials found in env vars. Set SNAPCHAT_AD_ACCOUNT_ID plus either " +
        "SNAPCHAT_APP_ID + SNAPCHAT_APP_SECRET + SNAPCHAT_REFRESH_TOKEN (auto-refreshing, preferred) " +
        "or SNAPCHAT_ACCESS_TOKEN for stdio mode."
    );
    return false;
  }

  // Validate token at startup to fail fast on invalid credentials
  await authAdapter.validate();

  const services = createSessionServices(
    authAdapter,
    {
      baseUrl: mcpConfig.snapchatApiBaseUrl,
      reportPollIntervalMs: mcpConfig.snapchatReportPollIntervalMs,
      reportMaxPollAttempts: mcpConfig.snapchatReportMaxPollAttempts,
    },
    logger,
    rateLimiter
  );

  sessionServiceStore.set(sessionId, services);
  logger.info("Stdio session services created successfully");
  return true;
}

bootstrapMcpServer({
  // Boot-time governance posture check + process-wide jti store (#166).
  tools: allTools,
  serviceName: "snapchat-mcp",
  config: mcpConfig,
  logger,
  transportMode,
  initOtel: initializeOpenTelemetry,
  setupStdioSession: setupStdioCredentials,
  createMcpServer,
  runStdio: runStdioServer,
  startHttp: startHttpServer,
  onShutdown: () => rateLimiter.destroy(),
}).catch((err) => {
  logger.fatal({ err }, "Failed to start snapchat-mcp");
  process.exit(1);
});
