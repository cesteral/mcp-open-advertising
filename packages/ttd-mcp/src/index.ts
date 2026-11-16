#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { mcpConfig } from "./config/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "@cesteral/shared";
import {
  detectTransportMode,
  createServerLogger,
  bootstrapMcpServer,
  createStdioSessionSetup,
} from "@cesteral/shared";
import { sessionServiceStore } from "./services/session-services.js";
import { buildEnvAuthAdapter, buildSessionServices } from "./services/session-wiring.js";
import { rateLimiter } from "./utils/platform.js";
import { allTools } from "./mcp-server/tools/definitions/index.js";

const transportMode = detectTransportMode();
const logger = createServerLogger("ttd-mcp", transportMode, otelLogMixin());

/** Stdio credentials come from the pre-generated TTD_API_TOKEN env var. */
const setupStdioCredentials = createStdioSessionSetup({
  sessionServiceStore,
  logger,
  buildEnvAdapter: () => buildEnvAuthAdapter(mcpConfig),
  buildServices: (adapter) => buildSessionServices(mcpConfig, adapter, logger),
  missingCredentialsWarning:
    "No TTD API token found in env vars. Set TTD_API_TOKEN for stdio mode.",
});

bootstrapMcpServer({
  // Boot-time governance posture check + process-wide jti store (#166).
  tools: allTools,
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
}).catch((err) => {
  logger.fatal({ err }, "Failed to start ttd-mcp");
  process.exit(1);
});
