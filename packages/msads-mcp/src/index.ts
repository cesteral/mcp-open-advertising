import { mcpConfig } from "./config/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "./utils/telemetry/index.js";
import { MsAdsAccessTokenAdapter } from "./auth/msads-auth-adapter.js";
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
const logger = createServerLogger("msads-mcp", transportMode, otelLogMixin());

/**
 * Set up credentials for stdio mode from environment variables.
 */
async function setupStdioCredentials(sessionId: string): Promise<boolean> {
  const { msadsAccessToken, msadsDeveloperToken, msadsCustomerId, msadsAccountId } = mcpConfig;

  if (!msadsAccessToken || !msadsDeveloperToken || !msadsCustomerId || !msadsAccountId) {
    logger.warn(
      "No Microsoft Ads credentials found in env vars. " +
      "Set MSADS_ACCESS_TOKEN, MSADS_DEVELOPER_TOKEN, MSADS_CUSTOMER_ID, and MSADS_ACCOUNT_ID for stdio mode."
    );
    return false;
  }

  const authAdapter = new MsAdsAccessTokenAdapter(
    msadsAccessToken,
    msadsDeveloperToken,
    msadsCustomerId,
    msadsAccountId,
    mcpConfig.msadsCustomerApiBaseUrl
  );

  await authAdapter.validate();

  const services = createSessionServices(
    authAdapter,
    mcpConfig.msadsCampaignApiBaseUrl,
    mcpConfig.msadsReportingApiBaseUrl,
    logger,
    rateLimiter,
    {
      reportPollIntervalMs: mcpConfig.msadsReportPollIntervalMs,
      reportMaxPollAttempts: mcpConfig.msadsReportMaxPollAttempts,
    }
  );

  sessionServiceStore.set(sessionId, services);
  logger.info("Stdio session services created successfully");
  return true;
}

bootstrapMcpServer({
  serviceName: "msads-mcp",
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
