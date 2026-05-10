#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { mcpConfig } from "./config/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "@cesteral/shared";
import { MsAdsAccessTokenAdapter } from "./auth/msads-auth-adapter.js";
import { detectTransportMode, createServerLogger, bootstrapMcpServer } from "@cesteral/shared";
import { createSessionServices, sessionServiceStore } from "./services/session-services.js";
import { rateLimiter } from "./utils/platform.js";

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
    {
      campaignApiBaseUrl: mcpConfig.msadsCampaignApiBaseUrl,
      reportingApiBaseUrl: mcpConfig.msadsReportingApiBaseUrl,
      customerApiBaseUrl: mcpConfig.msadsCustomerApiBaseUrl,
      reportPollIntervalMs: mcpConfig.msadsReportPollIntervalMs,
      reportMaxPollAttempts: mcpConfig.msadsReportMaxPollAttempts,
    },
    logger,
    rateLimiter
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
}).catch((err) => {
  logger.fatal({ err }, "Failed to start msads-mcp");
  process.exit(1);
});
