#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { mcpConfig } from "./config/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "./utils/telemetry/index.js";
import { SnapchatAccessTokenAdapter } from "./auth/snapchat-auth-adapter.js";
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
const logger = createServerLogger("snapchat-mcp", transportMode, otelLogMixin());

/**
 * Set up credentials for stdio mode from environment variables.
 * Creates a SnapchatAccessTokenAdapter and session services for the "stdio" session.
 */
async function setupStdioCredentials(sessionId: string): Promise<boolean> {
  const accessToken = mcpConfig.snapchatAccessToken;
  const adAccountId = mcpConfig.snapchatAdAccountId;

  if (!accessToken || !adAccountId) {
    logger.warn(
      "No Snapchat credentials found in env vars. " +
      "Set SNAPCHAT_ACCESS_TOKEN and SNAPCHAT_AD_ACCOUNT_ID for stdio mode."
    );
    return false;
  }

  const authAdapter = new SnapchatAccessTokenAdapter(
    accessToken,
    adAccountId,
    mcpConfig.snapchatApiBaseUrl,
    mcpConfig.snapchatOrgId ?? ""
  );

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