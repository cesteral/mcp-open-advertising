#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { mcpConfig } from "./config/index.js";
import { createMcpServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "@cesteral/shared";
import { PinterestAccessTokenAdapter } from "./auth/pinterest-auth-adapter.js";
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
const logger = createServerLogger("pinterest-mcp", transportMode, otelLogMixin());

/**
 * Stdio credentials come from env vars: a static access token and ad account id.
 */
const setupStdioCredentials = createStdioSessionSetup({
  sessionServiceStore,
  logger,
  buildEnvAdapter: () =>
    mcpConfig.pinterestAccessToken && mcpConfig.pinterestAdAccountId
      ? new PinterestAccessTokenAdapter(
          mcpConfig.pinterestAccessToken,
          mcpConfig.pinterestAdAccountId,
          mcpConfig.pinterestApiBaseUrl
        )
      : undefined,
  buildServices: (adapter) => buildSessionServices(mcpConfig, adapter, logger),
  missingCredentialsWarning:
    "No Pinterest credentials found in env vars. " +
    "Set PINTEREST_ACCESS_TOKEN and PINTEREST_AD_ACCOUNT_ID for stdio mode.",
});

bootstrapMcpServer({
  // Boot-time governance posture check + process-wide jti store (#166).
  tools: allTools,
  serviceName: "pinterest-mcp",
  config: mcpConfig,
  logger,
  transportMode,
  initOtel: initializeOpenTelemetry,
  setupStdioSession: setupStdioCredentials,
  createMcpServer,
  startHttp: startHttpServer,
  onShutdown: () => rateLimiter.destroy(),
}).catch((err) => {
  logger.fatal({ err }, "Failed to start pinterest-mcp");
  process.exit(1);
});
