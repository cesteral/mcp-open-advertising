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
  getCredentialFingerprint,
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
const logger = createServerLogger("cm360-mcp", transportMode, otelLogMixin());

// The fingerprint of the service account `buildEnvAdapter` loaded; keys the per-user rate limit.
let credentialFingerprint: string | undefined;

/** Stdio credentials come from a service account in env vars (file path or base64 JSON). */
const setupStdioCredentials = createStdioSessionSetup({
  sessionServiceStore,
  logger,
  buildEnvAdapter: () => {
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

    if (!credentialsJson) return undefined;

    const credentials = JSON.parse(credentialsJson) as ServiceAccountCredentials;
    credentialFingerprint = getCredentialFingerprint(credentials);
    return createGoogleAuthAdapter(credentials, [
      "https://www.googleapis.com/auth/dfareporting",
      "https://www.googleapis.com/auth/dfatrafficking",
    ]);
  },
  buildServices: (adapter) =>
    buildSessionServices(mcpConfig, adapter, logger, credentialFingerprint),
  missingCredentialsWarning:
    "No CM360 service account credentials found in env vars. Set CM360_SERVICE_ACCOUNT_JSON or CM360_SERVICE_ACCOUNT_FILE for stdio mode.",
});

bootstrapMcpServer({
  // Boot-time governance posture check + process-wide jti store (#166).
  tools: allTools,
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
