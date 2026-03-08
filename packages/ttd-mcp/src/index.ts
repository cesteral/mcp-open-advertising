import { mcpConfig } from "./config/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "./utils/telemetry/index.js";
import { TtdApiTokenAuthAdapter } from "./auth/ttd-auth-adapter.js";
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
const logger = createServerLogger("ttd-mcp", transportMode, otelLogMixin());

/**
 * Set up credentials for stdio mode from environment variables.
 * Creates a TtdApiTokenAuthAdapter and session services for the "stdio" session.
 */
function setupStdioCredentials(sessionId: string): boolean {
  const partnerId = mcpConfig.ttdPartnerId;
  const apiSecret = mcpConfig.ttdApiSecret;

  if (!partnerId || !apiSecret) {
    logger.warn(
      "No TTD credentials found in env vars. " +
      "Set TTD_PARTNER_ID and TTD_API_SECRET for stdio mode."
    );
    return false;
  }

  const authAdapter = new TtdApiTokenAuthAdapter(
    { partnerId, apiSecret },
    mcpConfig.ttdAuthUrl
  );

  const services = createSessionServices(
    authAdapter,
    {
      baseUrl: mcpConfig.ttdApiBaseUrl,
      graphqlUrl: mcpConfig.ttdGraphqlUrl,
      reportPollIntervalMs: mcpConfig.ttdReportPollIntervalMs,
      reportMaxPollAttempts: mcpConfig.ttdReportMaxPollAttempts,
    },
    logger,
    rateLimiter
  );

  sessionServiceStore.set(sessionId, services);
  logger.info("Stdio session services created successfully");
  return true;
}

bootstrapMcpServer({
  serviceName: "ttd-mcp",
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
