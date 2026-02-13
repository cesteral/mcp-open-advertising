import "reflect-metadata";

import pino from "pino";
import { mcpConfig } from "./config/index.js";
import { composeContainer } from "./container/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "./utils/telemetry/index.js";
import { TtdApiTokenAuthAdapter } from "./auth/ttd-auth-adapter.js";
import {
  createSessionServices,
  sessionServiceStore,
} from "./services/session-services.js";
import { rateLimiter } from "./utils/security/rate-limiter.js";

// Detect transport mode: if stdin is not a TTY, we're in stdio mode (e.g., Claude Desktop)
const isStdinPiped = !process.stdin.isTTY;
const transportMode = process.env.MCP_TRANSPORT_MODE || (isStdinPiped ? "stdio" : "http");

// Configure logger based on transport mode
// In stdio mode, ALL logs must go to stderr to avoid corrupting MCP protocol on stdout
const loggerConfig: pino.LoggerOptions = {
  name: "ttd-mcp",
  level: process.env.LOG_LEVEL || "info",
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin: otelLogMixin(),
};

if (transportMode === "http" && process.env.NODE_ENV === "development") {
  loggerConfig.transport = {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "HH:MM:ss Z",
      ignore: "pid,hostname",
    },
  };
}

const logger = transportMode === "stdio"
  ? pino(loggerConfig, pino.destination({ dest: 2 })) // dest: 2 = stderr
  : pino(loggerConfig);

initializeOpenTelemetry(mcpConfig, logger);

async function main() {
  try {
    logger.info("Composing dependency injection container");
    composeContainer(logger);

    if (transportMode === "stdio") {
      logger.info("Starting in stdio mode");

      const stdioSessionId = "stdio";
      setupStdioCredentials(stdioSessionId);

      const server = await createMcpServer(logger, stdioSessionId);
      await runStdioServer(server, logger);

      const handleStdioShutdown = () => {
        logger.info("Received shutdown signal (stdio mode) – closing MCP server");
        server.close().catch((err: unknown) => {
          logger.error({ err }, "Error closing MCP server");
        });
        process.exit(0);
      };

      process.on("SIGTERM", handleStdioShutdown);
      process.on("SIGINT", handleStdioShutdown);
    } else {
      logger.info("Starting in HTTP mode with Streamable HTTP transport");

      const { server: httpServer, shutdown } = await startHttpServer(mcpConfig, logger);

      let shuttingDown = false;
      const handleHttpShutdown = async (signal: string) => {
        if (shuttingDown) return;
        shuttingDown = true;

        logger.info({ signal }, "Shutting down gracefully...");

        httpServer.close((err) => {
          if (err) {
            logger.error({ err }, "Error closing HTTP server");
          } else {
            logger.info("HTTP server closed – no longer accepting connections");
          }
        });

        await shutdown();

        setTimeout(() => {
          logger.info("Shutdown complete – exiting");
          process.exit(0);
        }, 5_000);
      };

      process.on("SIGTERM", () => handleHttpShutdown("SIGTERM"));
      process.on("SIGINT", () => handleHttpShutdown("SIGINT"));
    }
  } catch (error) {
    logger.error({ error }, "Failed to start server");
    process.exit(1);
  }
}

/**
 * Set up credentials for stdio mode from environment variables.
 * Creates a TtdApiTokenAuthAdapter and session services for the "stdio" session.
 */
function setupStdioCredentials(sessionId: string): void {
  const partnerId = mcpConfig.ttdPartnerId;
  const apiSecret = mcpConfig.ttdApiSecret;

  if (!partnerId || !apiSecret) {
    logger.warn(
      "No TTD credentials found in env vars. " +
      "Set TTD_PARTNER_ID and TTD_API_SECRET for stdio mode."
    );
    return;
  }

  const authAdapter = new TtdApiTokenAuthAdapter(
    { partnerId, apiSecret },
    mcpConfig.ttdAuthUrl
  );

  const services = createSessionServices(
    authAdapter,
    mcpConfig.ttdApiBaseUrl,
    logger,
    rateLimiter
  );

  sessionServiceStore.set(sessionId, services);
  logger.info("Stdio session services created successfully");
}

main();
