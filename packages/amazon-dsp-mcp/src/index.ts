#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { mcpConfig } from "./config/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "@cesteral/shared";
import {
  AmazonDspAccessTokenAdapter,
  AmazonDspRefreshTokenAdapter,
  type AmazonDspAuthAdapter,
} from "./auth/amazon-dsp-auth-adapter.js";
import { detectTransportMode, createServerLogger, bootstrapMcpServer } from "@cesteral/shared";
import { createSessionServices, sessionServiceStore } from "./services/session-services.js";
import { rateLimiter } from "./utils/platform.js";

const transportMode = detectTransportMode();
const logger = createServerLogger("amazon-dsp-mcp", transportMode, otelLogMixin());

/**
 * Set up credentials for stdio mode from environment variables.
 *
 * Two flows, in preference order:
 * 1. **LwA refresh-token flow (recommended).** Set AMAZON_DSP_APP_ID + AMAZON_DSP_APP_SECRET
 *    + AMAZON_DSP_REFRESH_TOKEN + AMAZON_DSP_PROFILE_ID. The adapter mints short-lived
 *    access tokens via Login with Amazon (`api.amazon.com/auth/o2/token`) and refreshes
 *    them automatically before the 60-minute expiry.
 * 2. **Static access-token fallback.** Set AMAZON_DSP_ACCESS_TOKEN + AMAZON_DSP_PROFILE_ID.
 *    Useful for short CI runs; the token expires after 60 minutes and the server starts
 *    returning 401 until it's manually refreshed.
 */
async function setupStdioCredentials(sessionId: string): Promise<boolean> {
  const profileId = mcpConfig.amazonDspProfileId;
  if (!profileId) {
    logger.warn(
      "No AmazonDsp credentials found in env vars. " +
        "Set AMAZON_DSP_PROFILE_ID plus either (AMAZON_DSP_APP_ID + AMAZON_DSP_APP_SECRET + " +
        "AMAZON_DSP_REFRESH_TOKEN) for the refresh-token flow, or AMAZON_DSP_ACCESS_TOKEN " +
        "for a short-lived static token."
    );
    return false;
  }

  let authAdapter: AmazonDspAuthAdapter;

  if (
    mcpConfig.amazonDspAppId &&
    mcpConfig.amazonDspAppSecret &&
    mcpConfig.amazonDspRefreshToken
  ) {
    authAdapter = new AmazonDspRefreshTokenAdapter(
      {
        appId: mcpConfig.amazonDspAppId,
        appSecret: mcpConfig.amazonDspAppSecret,
        refreshToken: mcpConfig.amazonDspRefreshToken,
      },
      profileId,
      mcpConfig.amazonDspApiBaseUrl
    );
    logger.info("Using LwA refresh-token flow (auto-refreshing access tokens)");
  } else if (mcpConfig.amazonDspAccessToken) {
    authAdapter = new AmazonDspAccessTokenAdapter(
      mcpConfig.amazonDspAccessToken,
      profileId,
      mcpConfig.amazonDspApiBaseUrl,
      mcpConfig.amazonDspClientId
    );
    logger.warn(
      "Using static access-token flow — token expires after 60 minutes. " +
        "For long-running sessions, configure AMAZON_DSP_APP_ID + AMAZON_DSP_APP_SECRET + AMAZON_DSP_REFRESH_TOKEN instead."
    );
  } else {
    logger.warn(
      "No AmazonDsp credentials found. Set AMAZON_DSP_APP_ID + AMAZON_DSP_APP_SECRET + " +
        "AMAZON_DSP_REFRESH_TOKEN (recommended) or AMAZON_DSP_ACCESS_TOKEN."
    );
    return false;
  }

  // Validate token at startup to fail fast on invalid credentials
  await authAdapter.validate();

  const services = createSessionServices(
    authAdapter,
    {
      baseUrl: mcpConfig.amazonDspApiBaseUrl,
      reportPollIntervalMs: mcpConfig.amazonDspReportPollIntervalMs,
      reportMaxPollAttempts: mcpConfig.amazonDspReportMaxPollAttempts,
      clientId: mcpConfig.amazonDspClientId,
    },
    logger,
    rateLimiter
  );

  sessionServiceStore.set(sessionId, services);
  logger.info("Stdio session services created successfully");
  return true;
}

bootstrapMcpServer({
  serviceName: "amazon-dsp-mcp",
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
  logger.fatal({ err }, "Failed to start amazon-dsp-mcp");
  process.exit(1);
});
