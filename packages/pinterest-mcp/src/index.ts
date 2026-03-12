import { mcpConfig } from "./config/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "./utils/telemetry/index.js";
import { PinterestAccessTokenAdapter } from "./auth/pinterest-auth-adapter.js";
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
const logger = createServerLogger("pinterest-mcp", transportMode, otelLogMixin());

/**
 * Set up credentials for stdio mode from environment variables.
 * Creates a PinterestAccessTokenAdapter and session services for the "stdio" session.
 */
async function setupStdioCredentials(sessionId: string): Promise<boolean> {
  const accessToken = mcpConfig.pinterestAccessToken;
  const adAccountId = mcpConfig.pinterestAdAccountId;

  if (!accessToken || !adAccountId) {
    logger.warn(
      "No Pinterest credentials found in env vars. " +
      "Set PINTEREST_ACCESS_TOKEN and PINTEREST_AD_ACCOUNT_ID for stdio mode."
    );
    return false;
  }

  const authAdapter = new PinterestAccessTokenAdapter(
    accessToken,
    adAccountId,
    mcpConfig.pinterestApiBaseUrl
  );

  // Validate token at startup to fail fast on invalid credentials
  await authAdapter.validate();

  const services = createSessionServices(
    authAdapter,
    mcpConfig.pinterestApiBaseUrl,
    logger,
    rateLimiter,
    {
      reportPollIntervalMs: mcpConfig.pinterestReportPollIntervalMs,
      reportMaxPollAttempts: mcpConfig.pinterestReportMaxPollAttempts,
    }
  );

  sessionServiceStore.set(sessionId, services);
  logger.info("Stdio session services created successfully");
  return true;
}

bootstrapMcpServer({
  serviceName: "pinterest-mcp",
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
