#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { mcpConfig } from "./config/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "@cesteral/shared";
import { AmazonDspRefreshTokenAdapter } from "./auth/amazon-dsp-auth-adapter.js";
import {
  detectTransportMode,
  createServerLogger,
  bootstrapMcpServer,
  createStdioSessionSetup,
} from "@cesteral/shared";
import { sessionServiceStore } from "./services/session-services.js";
import { buildEnvAuthAdapter, buildSessionServices } from "./services/session-wiring.js";
import { rateLimiter } from "./utils/platform.js";
import { allTools } from "./mcp-server/tools/definitions/index.js";
import { evaluateRefreshTokenAge } from "./utils/refresh-token-age.js";

const transportMode = detectTransportMode();
const logger = createServerLogger("amazon-dsp-mcp", transportMode, otelLogMixin());

/** Stdio credentials come from env vars; the LwA refresh-token flow is preferred. */
const setupStdioCredentials = createStdioSessionSetup({
  sessionServiceStore,
  logger,
  buildEnvAdapter: () => {
    const adapter = buildEnvAuthAdapter(mcpConfig);
    if (adapter instanceof AmazonDspRefreshTokenAdapter) {
      logger.info("Using LwA refresh-token flow (auto-refreshing access tokens)");
    } else if (adapter) {
      logger.warn(
        "Using static access-token flow — token expires after 60 minutes. " +
          "For long-running sessions, configure AMAZON_DSP_APP_ID + AMAZON_DSP_APP_SECRET + AMAZON_DSP_REFRESH_TOKEN instead."
      );
    }
    return adapter;
  },
  buildServices: (adapter) => buildSessionServices(mcpConfig, adapter, logger),
  missingCredentialsWarning:
    "No AmazonDsp credentials found in env vars. " +
    "Set AMAZON_DSP_PROFILE_ID plus either (AMAZON_DSP_APP_ID + AMAZON_DSP_APP_SECRET + " +
    "AMAZON_DSP_REFRESH_TOKEN) for the refresh-token flow, or AMAZON_DSP_ACCESS_TOKEN " +
    "for a short-lived static token.",
});

// Opt-in age warning for the env-configured refresh token. Amazon expires
// refresh tokens 365 days after issuance (consent granted on/after 2026-07-30,
// campaign_management + audiences scopes); an expired token fails every
// refresh with invalid_grant until the advertiser re-authorizes the app.
const tokenAge = evaluateRefreshTokenAge(
  mcpConfig.amazonDspRefreshTokenIssuedAt,
  new Date(),
  mcpConfig.amazonDspRefreshTokenWarnAgeDays
);
if (tokenAge?.expired) {
  logger.error(
    { ageDays: tokenAge.ageDays },
    "AMAZON_DSP_REFRESH_TOKEN is past Amazon's 365-day lifetime — refresh calls will fail with invalid_grant until the advertiser re-authorizes the app"
  );
} else if (tokenAge?.warn) {
  logger.warn(
    { ageDays: tokenAge.ageDays, daysUntilExpiry: tokenAge.daysUntilExpiry },
    "AMAZON_DSP_REFRESH_TOKEN is approaching Amazon's 365-day lifetime — ask the advertiser to re-authorize before it expires"
  );
}

bootstrapMcpServer({
  // Boot-time governance posture check + process-wide jti store (#166).
  tools: allTools,
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
