#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { mcpConfig } from "./config/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "@cesteral/shared";
import { MetaAccessTokenAdapter } from "./auth/meta-auth-adapter.js";
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
const logger = createServerLogger("meta-mcp", transportMode, otelLogMixin());

/** Stdio credentials come from env vars: a static access token. */
const setupStdioCredentials = createStdioSessionSetup({
  sessionServiceStore,
  logger,
  buildEnvAdapter: () =>
    mcpConfig.metaAccessToken
      ? new MetaAccessTokenAdapter(mcpConfig.metaAccessToken, mcpConfig.metaApiBaseUrl)
      : undefined,
  buildServices: (adapter) => buildSessionServices(mcpConfig, adapter, logger),
  missingCredentialsWarning:
    "No Meta credentials found in env vars. Set META_ACCESS_TOKEN for stdio mode.",
});

bootstrapMcpServer({
  // Boot-time governance posture check + process-wide jti store (#166).
  tools: allTools,
  serviceName: "meta-mcp",
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
  logger.fatal({ err }, "Failed to start meta-mcp");
  process.exit(1);
});
