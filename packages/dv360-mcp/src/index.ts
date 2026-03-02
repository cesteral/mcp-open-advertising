import "reflect-metadata";
import { readFileSync } from "fs";

import { mcpConfig } from "./config/index.js";
import { composeContainer } from "./container/index.js";
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
const logger = createServerLogger("dv360-mcp", transportMode, otelLogMixin());

/**
 * Set up credentials for stdio mode from environment variables.
 * Creates a GoogleAuthAdapter and session services for the "stdio" session.
 */
function setupStdioCredentials(sessionId: string): boolean {
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

  const credentials = JSON.parse(credentialsJson) as ServiceAccountCredentials;
  const authAdapter = createGoogleAuthAdapter(credentials, [
    "https://www.googleapis.com/auth/display-video",
  ]);

  const services = createSessionServices(
    authAdapter,
    mcpConfig.dv360ApiBaseUrl,
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
  composeContainer,
  initOtel: initializeOpenTelemetry,
  setupStdioSession: setupStdioCredentials,
  createMcpServer,
  runStdio: runStdioServer,
  startHttp: startHttpServer,
  onShutdown: () => rateLimiter.destroy(),
});
