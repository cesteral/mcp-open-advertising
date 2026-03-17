// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { mcpConfig } from "./config/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "./utils/telemetry/index.js";
import { AmazonDspAccessTokenAdapter } from "./auth/amazon-dsp-auth-adapter.js";
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
const logger = createServerLogger("amazon-dsp-mcp", transportMode, otelLogMixin());

/**
 * Set up credentials for stdio mode from environment variables.
 * Creates a AmazonDspAccessTokenAdapter and session services for the "stdio" session.
 */
async function setupStdioCredentials(sessionId: string): Promise<boolean> {
  const accessToken = mcpConfig.amazonDspAccessToken;
  const profileId = mcpConfig.amazonDspProfileId;

  if (!accessToken || !profileId) {
    logger.warn(
      "No AmazonDsp credentials found in env vars. " +
      "Set AMAZON_DSP_ACCESS_TOKEN and AMAZON_DSP_PROFILE_ID for stdio mode."
    );
    return false;
  }

  const authAdapter = new AmazonDspAccessTokenAdapter(
    accessToken,
    profileId,
    mcpConfig.amazonDspApiBaseUrl,
    mcpConfig.amazonDspClientId
  );

  // Validate token at startup to fail fast on invalid credentials
  await authAdapter.validate();

  const services = createSessionServices(
    authAdapter,
    {
      baseUrl: mcpConfig.amazonDspApiBaseUrl,
      reportPollIntervalMs: mcpConfig.amazonDspReportPollIntervalMs,
      reportMaxPollAttempts: mcpConfig.amazonDspReportMaxPollAttempts,
      clientId: mcpConfig.amazonDspClientId,
    },
    logger,
    rateLimiter
  );

  sessionServiceStore.set(sessionId, services);
  logger.info("Stdio session services created successfully");
  return true;
}

bootstrapMcpServer({
  serviceName: "amazon-dsp-mcp",
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
  logger.fatal({ err }, "Failed to start amazon-dsp-mcp");
  process.exit(1);
});