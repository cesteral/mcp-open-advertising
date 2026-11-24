#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { readFileSync } from "fs";

import { mcpConfig } from "./config/index.js";
import { createMcpServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "@cesteral/shared";
import {
  createGoogleAuthAdapter,
  type ServiceAccountCredentials,
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
const logger = createServerLogger("dbm-mcp", transportMode, otelLogMixin());

/** Stdio credentials come from a service account in env vars (file path or base64 JSON). */
const setupStdioCredentials = createStdioSessionSetup({
  sessionServiceStore,
  logger,
  buildEnvAdapter: () => {
    let credentialsJson: string | undefined;

    if (mcpConfig.serviceAccountFile) {
      logger.info(
        { file: mcpConfig.serviceAccountFile },
        "Loading service account from file (stdio mode)"
      );
      credentialsJson = readFileSync(mcpConfig.serviceAccountFile, "utf-8");
    } else if (mcpConfig.serviceAccountJson) {
      credentialsJson = Buffer.from(mcpConfig.serviceAccountJson, "base64").toString();
    }

    if (!credentialsJson) return undefined;

    const credentials = JSON.parse(credentialsJson) as ServiceAccountCredentials;
    return createGoogleAuthAdapter(credentials, [
      "https://www.googleapis.com/auth/doubleclickbidmanager",
    ]);
  },
  buildServices: (adapter) => buildSessionServices(mcpConfig, adapter, logger),
  missingCredentialsWarning:
    "No service account credentials found in env vars. Set SERVICE_ACCOUNT_JSON or SERVICE_ACCOUNT_FILE for stdio mode.",
});

bootstrapMcpServer({
  // Boot-time governance posture check + process-wide jti store (#166).
  tools: allTools,
  serviceName: "dbm-mcp",
  config: mcpConfig,
  logger,
  transportMode,
  initOtel: initializeOpenTelemetry,
  setupStdioSession: setupStdioCredentials,
  createMcpServer,
  startHttp: startHttpServer,
  onShutdown: () => rateLimiter.destroy(),
}).catch((err) => {
  logger.fatal({ err }, "Failed to start dbm-mcp");
  process.exit(1);
});
