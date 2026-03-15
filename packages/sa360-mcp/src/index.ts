// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { mcpConfig } from "./config/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "./utils/telemetry/index.js";
import { SA360RefreshTokenAuthAdapter } from "./auth/sa360-auth-adapter.js";
import {
  detectTransportMode,
  createServerLogger,
  bootstrapMcpServer,
} from "@cesteral/shared";
import {
  createSessionServices,
  sessionServiceStore,
} from "./services/session-services.js";
import { rateLimiter } from "./utils/security/rate-limiter.js";

const transportMode = detectTransportMode();
const logger = createServerLogger("sa360-mcp", transportMode, otelLogMixin());

/**
 * Set up credentials for stdio mode from environment variables.
 * Creates a SA360RefreshTokenAuthAdapter and session services for the "stdio" session.
 */
async function setupStdioCredentials(sessionId: string): Promise<boolean> {
  const clientId = mcpConfig.sa360ClientId;
  const clientSecret = mcpConfig.sa360ClientSecret;
  const refreshToken = mcpConfig.sa360RefreshToken;

  if (!clientId || !clientSecret || !refreshToken) {
    logger.warn(
      "No SA360 credentials found in env vars. " +
      "Set SA360_CLIENT_ID, SA360_CLIENT_SECRET, and SA360_REFRESH_TOKEN for stdio mode."
    );
    return false;
  }

  const authAdapter = new SA360RefreshTokenAuthAdapter({
    clientId,
    clientSecret,
    refreshToken,
    loginCustomerId: mcpConfig.sa360LoginCustomerId,
  });

  // Validate credentials at startup to fail fast on invalid OAuth2 tokens
  await authAdapter.validate();

  const services = createSessionServices(
    authAdapter,
    { baseUrl: mcpConfig.sa360ApiBaseUrl, v2BaseUrl: mcpConfig.sa360V2ApiBaseUrl },
    logger,
    rateLimiter
  );

  sessionServiceStore.set(sessionId, services);
  logger.info("Stdio session services created successfully");
  return true;
}

bootstrapMcpServer({
  serviceName: "sa360-mcp",
  config: mcpConfig,
  logger,
  transportMode,
  initOtel: initializeOpenTelemetry,
  setupStdioSession: setupStdioCredentials,
  createMcpServer,
  runStdio: runStdioServer,
  startHttp: startHttpServer,
  onShutdown: () => rateLimiter.destroy(),
});