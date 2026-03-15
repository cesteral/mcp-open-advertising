import { mcpConfig } from "./config/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "./utils/telemetry/index.js";
import { TikTokAccessTokenAdapter } from "./auth/tiktok-auth-adapter.js";
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
const logger = createServerLogger("tiktok-mcp", transportMode, otelLogMixin());

/**
 * Set up credentials for stdio mode from environment variables.
 * Creates a TikTokAccessTokenAdapter and session services for the "stdio" session.
 */
async function setupStdioCredentials(sessionId: string): Promise<boolean> {
  const accessToken = mcpConfig.tiktokAccessToken;
  const advertiserId = mcpConfig.tiktokAdvertiserId;

  if (!accessToken || !advertiserId) {
    logger.warn(
      "No TikTok credentials found in env vars. " +
      "Set TIKTOK_ACCESS_TOKEN and TIKTOK_ADVERTISER_ID for stdio mode."
    );
    return false;
  }

  const authAdapter = new TikTokAccessTokenAdapter(
    accessToken,
    advertiserId,
    mcpConfig.tiktokApiBaseUrl
  );

  // Validate token at startup to fail fast on invalid credentials
  await authAdapter.validate();

  const services = createSessionServices(
    authAdapter,
    {
      baseUrl: mcpConfig.tiktokApiBaseUrl,
      reportPollIntervalMs: mcpConfig.tiktokReportPollIntervalMs,
      reportMaxPollAttempts: mcpConfig.tiktokReportMaxPollAttempts,
    },
    logger,
    rateLimiter
  );

  sessionServiceStore.set(sessionId, services);
  logger.info("Stdio session services created successfully");
  return true;
}

bootstrapMcpServer({
  serviceName: "tiktok-mcp",
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
