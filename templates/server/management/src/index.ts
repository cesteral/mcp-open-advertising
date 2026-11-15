#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { mcpConfig } from "./config/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "@cesteral/shared";
import { {{Pascal}}AccessTokenAdapter } from "./auth/{{key}}-auth-adapter.js";
import { detectTransportMode, createServerLogger, bootstrapMcpServer } from "@cesteral/shared";
import { createSessionServices, sessionServiceStore } from "./services/session-services.js";
import { rateLimiter } from "./utils/platform.js";
import { allTools } from "./mcp-server/tools/definitions/index.js";

const transportMode = detectTransportMode();
const logger = createServerLogger("{{package}}", transportMode, otelLogMixin());

/** Stdio mode: credentials from {{ENV}}_ACCESS_TOKEN and {{ENV}}_ACCOUNT_ID. */
async function setupStdioCredentials(sessionId: string): Promise<boolean> {
  const { accessToken, accountId } = mcpConfig;
  if (!accessToken || !accountId) {
    logger.warn(
      "No {{displayName}} credentials found in env vars. " +
        "Set {{ENV}}_ACCESS_TOKEN and {{ENV}}_ACCOUNT_ID for stdio mode."
    );
    return false;
  }

  const authAdapter = new {{Pascal}}AccessTokenAdapter(accessToken, accountId, mcpConfig.apiBaseUrl);
  await authAdapter.validate();

  sessionServiceStore.set(
    sessionId,
    createSessionServices(authAdapter, { baseUrl: mcpConfig.apiBaseUrl }, logger, rateLimiter)
  );
  logger.info("Stdio session services created successfully");
  return true;
}

bootstrapMcpServer({
  tools: allTools,
  serviceName: "{{package}}",
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
  logger.fatal({ err }, "Failed to start {{package}}");
  process.exit(1);
});
