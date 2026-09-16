#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { mcpConfig } from "./config/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "@cesteral/shared";
import { LinkedInAccessTokenAdapter } from "./auth/linkedin-auth-adapter.js";
import { detectTransportMode, createServerLogger, bootstrapMcpServer } from "@cesteral/shared";
import { createSessionServices, sessionServiceStore } from "./services/session-services.js";
import { rateLimiter } from "./utils/platform.js";
import { allTools } from "./mcp-server/tools/definitions/index.js";
import {
  classifyLinkedInApiVersion,
  describeLinkedInApiVersionStatus,
} from "./config/api-version.js";

const transportMode = detectTransportMode();
const logger = createServerLogger("linkedin-mcp", transportMode, otelLogMixin());

// Surface a stale LinkedIn-Version at boot. A sunset moniker makes LinkedIn
// ERROR on every request (#206), so an operator seeing auth or tool failures
// should find the cause in the first lines of the log rather than inferring it
// from a wall of 4xx. Not fatal: the version is operator-overridable, and
// refusing to boot on a date-derived judgement would be worse than serving a
// server whose logs say exactly what is wrong.
{
  const version = mcpConfig.linkedinApiVersion;
  const message = describeLinkedInApiVersionStatus(version);
  if (message) {
    const status = classifyLinkedInApiVersion(version);
    const entry = { linkedinApiVersion: version, status };
    if (status === "sunset") logger.error(entry, message);
    else logger.warn(entry, message);
  }
}

/**
 * Set up credentials for stdio mode from environment variables.
 * Creates a LinkedInAccessTokenAdapter and session services for the "stdio" session.
 */
async function setupStdioCredentials(sessionId: string): Promise<boolean> {
  const accessToken = mcpConfig.linkedinAccessToken;

  if (!accessToken) {
    logger.warn(
      "No LinkedIn credentials found in env vars. " + "Set LINKEDIN_ACCESS_TOKEN for stdio mode."
    );
    return false;
  }

  const authAdapter = new LinkedInAccessTokenAdapter(
    accessToken,
    mcpConfig.linkedinApiBaseUrl,
    mcpConfig.linkedinApiVersion
  );

  // Validate token at startup to fail fast on invalid credentials
  await authAdapter.validate();

  const services = createSessionServices(
    authAdapter,
    { baseUrl: mcpConfig.linkedinApiBaseUrl, apiVersion: mcpConfig.linkedinApiVersion },
    logger,
    rateLimiter
  );

  sessionServiceStore.set(sessionId, services);
  logger.info("Stdio session services created successfully");
  return true;
}

bootstrapMcpServer({
  // Boot-time governance posture check + process-wide jti store (#166).
  tools: allTools,
  serviceName: "linkedin-mcp",
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
  logger.fatal({ err }, "Failed to start linkedin-mcp");
  process.exit(1);
});
