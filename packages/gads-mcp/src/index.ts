import "reflect-metadata";

import { mcpConfig } from "./config/index.js";
import { composeContainer } from "./container/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "./utils/telemetry/index.js";
import { GAdsRefreshTokenAuthAdapter } from "./auth/gads-auth-adapter.js";
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
const logger = createServerLogger("gads-mcp", transportMode, otelLogMixin());

/**
 * Set up credentials for stdio mode from environment variables.
 * Creates a GAdsRefreshTokenAuthAdapter and session services for the "stdio" session.
 */
function setupStdioCredentials(sessionId: string): boolean {
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

  const services = createSessionServices(
    authAdapter,
    mcpConfig.gadsApiBaseUrl,
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
  composeContainer,
  initOtel: initializeOpenTelemetry,
  setupStdioSession: setupStdioCredentials,
  createMcpServer,
  runStdio: runStdioServer,
  startHttp: startHttpServer,
  onShutdown: () => rateLimiter.destroy(),
});
