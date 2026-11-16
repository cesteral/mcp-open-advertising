#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { readFileSync } from "fs";

import { mcpConfig } from "./config/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
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
const logger = createServerLogger("dv360-mcp", transportMode, otelLogMixin());

/** Stdio credentials come from a service account in env vars (file path or base64 JSON). */
const setupStdioCredentials = createStdioSessionSetup({
  sessionServiceStore,
  logger,
  buildEnvAdapter: () => {
    let credentialsJson: string | undefined;

    if (mcpConfig.dv360ServiceAccountFile) {
      logger.info(
        { file: mcpConfig.dv360ServiceAccountFile },
        "Loading service account from file (stdio mode)"
      );
      credentialsJson = readFileSync(mcpConfig.dv360ServiceAccountFile, "utf-8");
    } else if (mcpConfig.dv360ServiceAccountJson) {
      credentialsJson = Buffer.from(mcpConfig.dv360ServiceAccountJson, "base64").toString();
    }

    if (!credentialsJson) return undefined;

    let credentials: ServiceAccountCredentials;
    try {
      credentials = JSON.parse(credentialsJson) as ServiceAccountCredentials;
    } catch {
      throw new Error(
        "Failed to parse DV360 service account credentials — ensure the JSON in DV360_SERVICE_ACCOUNT_JSON (base64) or DV360_SERVICE_ACCOUNT_FILE is valid"
      );
    }
    return createGoogleAuthAdapter(credentials, ["https://www.googleapis.com/auth/display-video"]);
  },
  buildServices: (adapter) => buildSessionServices(mcpConfig, adapter, logger),
  missingCredentialsWarning:
    "No DV360 service account credentials found in env vars. Set DV360_SERVICE_ACCOUNT_JSON or DV360_SERVICE_ACCOUNT_FILE for stdio mode.",
});

bootstrapMcpServer({
  // Boot-time governance posture check + process-wide jti store (#166).
  tools: allTools,
  serviceName: "dv360-mcp",
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
  logger.fatal({ err }, "Failed to start dv360-mcp");
  process.exit(1);
});
