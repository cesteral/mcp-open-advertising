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
} from "@cesteral/shared";
import { createSessionServices, sessionServiceStore } from "./services/session-services.js";
import { rateLimiter } from "./utils/platform.js";

const transportMode = detectTransportMode();
const logger = createServerLogger("cm360-mcp", transportMode, otelLogMixin());

/**
 * Set up credentials for stdio mode from environment variables.
 * Creates a GoogleAuthAdapter and session services for the "stdio" session.
 */
async function setupStdioCredentials(sessionId: string): Promise<boolean> {
  let credentialsJson: string | undefined;

  if (mcpConfig.cm360ServiceAccountFile) {
    logger.info(
      { file: mcpConfig.cm360ServiceAccountFile },
      "Loading service account from file (stdio mode)"
    );
    credentialsJson = readFileSync(mcpConfig.cm360ServiceAccountFile, "utf-8");
  } else if (mcpConfig.cm360ServiceAccountJson) {
    credentialsJson = Buffer.from(mcpConfig.cm360ServiceAccountJson, "base64").toString();
  }

  if (!credentialsJson) {
    logger.warn(
      "No CM360 service account credentials found in env vars. " +
        "Set CM360_SERVICE_ACCOUNT_JSON or CM360_SERVICE_ACCOUNT_FILE for stdio mode."
    );
    return false;
  }

  const credentials = JSON.parse(credentialsJson) as ServiceAccountCredentials;
  const authAdapter = createGoogleAuthAdapter(credentials, [
    "https://www.googleapis.com/auth/dfareporting",
    "https://www.googleapis.com/auth/dfatrafficking",
  ]);

  // Validate credentials at startup to fail fast on invalid service account
  await authAdapter.validate();

  const services = createSessionServices(
    authAdapter,
    { baseUrl: mcpConfig.cm360ApiBaseUrl },
    logger,
    rateLimiter
  );

  sessionServiceStore.set(sessionId, services);
  logger.info("Stdio session services created successfully");
  return true;
}

bootstrapMcpServer({
  serviceName: "cm360-mcp",
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
  logger.fatal({ err }, "Failed to start cm360-mcp");
  process.exit(1);
});
