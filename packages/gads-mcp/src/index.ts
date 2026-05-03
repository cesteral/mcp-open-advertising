#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { mcpConfig } from "./config/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "@cesteral/shared";
import { GAdsRefreshTokenAuthAdapter } from "./auth/gads-auth-adapter.js";
import { detectTransportMode, createServerLogger, bootstrapMcpServer } from "@cesteral/shared";
import { createSessionServices, sessionServiceStore } from "./services/session-services.js";
import { rateLimiter } from "./utils/platform.js";

const transportMode = detectTransportMode();
const logger = createServerLogger("gads-mcp", transportMode, otelLogMixin());

/**
 * Set up credentials for stdio mode from environment variables.
 * Creates a GAdsRefreshTokenAuthAdapter and session services for the "stdio" session.
 */
async function setupStdioCredentials(sessionId: string): Promise<boolean> {
  const developerToken = mcpConfig.gadsDeveloperToken;
  const clientId = mcpConfig.gadsClientId;
  const clientSecret = mcpConfig.gadsClientSecret;
  const refreshToken = mcpConfig.gadsRefreshToken;

  if (!developerToken || !clientId || !clientSecret || !refreshToken) {
    logger.warn(
      "No Google Ads credentials found in env vars. " +
        "Set GADS_DEVELOPER_TOKEN, GADS_CLIENT_ID, GADS_CLIENT_SECRET, and GADS_REFRESH_TOKEN for stdio mode."
    );
    return false;
  }

  const authAdapter = new GAdsRefreshTokenAuthAdapter({
    developerToken,
    clientId,
    clientSecret,
    refreshToken,
    loginCustomerId: mcpConfig.gadsLoginCustomerId,
  });

  // Validate credentials at startup to fail fast on invalid OAuth2 tokens
  await authAdapter.validate();

  const services = createSessionServices(
    authAdapter,
    { baseUrl: mcpConfig.gadsApiBaseUrl },
    logger,
    rateLimiter
  );

  sessionServiceStore.set(sessionId, services);
  logger.info("Stdio session services created successfully");
  return true;
}

bootstrapMcpServer({
  serviceName: "gads-mcp",
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
  logger.fatal({ err }, "Failed to start gads-mcp");
  process.exit(1);
});
