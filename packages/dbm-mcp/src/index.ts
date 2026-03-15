// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { readFileSync } from "fs";

import { mcpConfig } from "./config/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "./utils/telemetry/index.js";
import {
  createGoogleAuthAdapter,
  type ServiceAccountCredentials,
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
const logger = createServerLogger("dbm-mcp", transportMode, otelLogMixin());

/**
 * Set up credentials for stdio mode from environment variables.
 * Creates a GoogleAuthAdapter and session services for the "stdio" session.
 */
async function setupStdioCredentials(sessionId: string): Promise<boolean> {
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

  if (!credentialsJson) {
    logger.warn(
      "No service account credentials found in env vars. " +
      "Set SERVICE_ACCOUNT_JSON or SERVICE_ACCOUNT_FILE for stdio mode."
    );
    return false;
  }

  const credentials = JSON.parse(credentialsJson) as ServiceAccountCredentials;
  const authAdapter = createGoogleAuthAdapter(credentials, [
    "https://www.googleapis.com/auth/doubleclickbidmanager",
  ]);

  // Validate credentials at startup to fail fast on invalid service account
  await authAdapter.validate();

  const services = createSessionServices(authAdapter, mcpConfig, logger, rateLimiter);
  sessionServiceStore.set(sessionId, services);
  logger.info("Stdio session services created successfully");
  return true;
}

bootstrapMcpServer({
  serviceName: "dbm-mcp",
  config: mcpConfig,
  logger,
  transportMode,
  initOtel: initializeOpenTelemetry,
  setupStdioSession: setupStdioCredentials,
  createMcpServer,
  runStdio: runStdioServer,
  startHttp: startHttpServer,
  onShutdown: () => rateLimiter.destroy(),
});