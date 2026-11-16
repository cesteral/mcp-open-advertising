#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { mcpConfig } from "./config/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "@cesteral/shared";
import { TikTokAccessTokenAdapter } from "./auth/tiktok-auth-adapter.js";
import {
  detectTransportMode,
  createServerLogger,
  bootstrapMcpServer,
  createStdioSessionSetup,
} from "@cesteral/shared";
import { sessionServiceStore } from "./services/session-services.js";
import { buildSessionServices } from "./services/session-wiring.js";
import { rateLimiter } from "./utils/platform.js";
import { allTools } from "./mcp-server/tools/definitions/index.js";

const transportMode = detectTransportMode();
const logger = createServerLogger("tiktok-mcp", transportMode, otelLogMixin());

/**
 * Stdio credentials come from env vars: a static access token only. TikTok
 * documents no refresh endpoint, so there is no refresh-token flow here.
 */
const setupStdioCredentials = createStdioSessionSetup({
  sessionServiceStore,
  logger,
  buildEnvAdapter: () =>
    mcpConfig.tiktokAccessToken && mcpConfig.tiktokAdvertiserId
      ? new TikTokAccessTokenAdapter(
          mcpConfig.tiktokAccessToken,
          mcpConfig.tiktokAdvertiserId,
          mcpConfig.tiktokApiBaseUrl,
          mcpConfig.tiktokApiVersion
        )
      : undefined,
  buildServices: (adapter) => buildSessionServices(mcpConfig, adapter, logger),
  missingCredentialsWarning:
    "No TikTok credentials found in env vars. " +
    "Set TIKTOK_ACCESS_TOKEN and TIKTOK_ADVERTISER_ID for stdio mode.",
});

bootstrapMcpServer({
  // Boot-time governance posture check + process-wide jti store (#166).
  tools: allTools,
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
}).catch((err) => {
  logger.fatal({ err }, "Failed to start tiktok-mcp");
  process.exit(1);
});
