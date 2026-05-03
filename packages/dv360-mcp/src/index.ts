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
const logger = createServerLogger("dv360-mcp", transportMode, otelLogMixin());

/**
 * Set up credentials for stdio mode from environment variables.
 * Creates a GoogleAuthAdapter and session services for the "stdio" session.
 */
async function setupStdioCredentials(sessionId: string): Promise<boolean> {
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

  if (!credentialsJson) {
    logger.warn(
      "No DV360 service account credentials found in env vars. " +
        "Set DV360_SERVICE_ACCOUNT_JSON or DV360_SERVICE_ACCOUNT_FILE for stdio mode."
    );
    return false;
  }

  let credentials: ServiceAccountCredentials;
  try {
    credentials = JSON.parse(credentialsJson) as ServiceAccountCredentials;
  } catch {
    throw new Error(
      "Failed to parse DV360 service account credentials — ensure the JSON in DV360_SERVICE_ACCOUNT_JSON (base64) or DV360_SERVICE_ACCOUNT_FILE is valid"
    );
  }
  const authAdapter = createGoogleAuthAdapter(credentials, [
    "https://www.googleapis.com/auth/display-video",
  ]);

  // Validate credentials at startup to fail fast on invalid service account
  await authAdapter.validate();

  const services = createSessionServices(
    authAdapter,
    { baseUrl: mcpConfig.dv360ApiBaseUrl },
    logger,
    rateLimiter
  );

  sessionServiceStore.set(sessionId, services);
  logger.info("Stdio session services created successfully");
  return true;
}

bootstrapMcpServer({
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
