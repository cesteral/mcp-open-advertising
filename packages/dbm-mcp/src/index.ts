import "reflect-metadata";
import { readFileSync } from "fs";
import type http from "http";
import pino from "pino";
import { mcpConfig } from "./config/index.js";
import { composeContainer } from "./container/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { createMcpHttpServer } from "./mcp-server/transports/http-transport.js";
import { initializeOpenTelemetry } from "./utils/telemetry/index.js";
import {
  createGoogleAuthAdapter,
  type ServiceAccountCredentials,
} from "@bidshifter/shared";
import {
  createSessionServices,
  sessionServiceStore,
} from "./services/session-services.js";

// Detect transport mode: if stdin is not a TTY, we're in stdio mode (e.g., Claude Desktop)
const isStdinPiped = !process.stdin.isTTY;
const transportMode = process.env.MCP_TRANSPORT_MODE || (isStdinPiped ? "stdio" : "http");

// Configure logger based on transport mode
// In stdio mode, ALL logs must go to stderr to avoid corrupting MCP protocol on stdout
const loggerConfig: pino.LoggerOptions = {
  name: "dbm-mcp",
  level: process.env.LOG_LEVEL || "info",
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

// Add transport configuration based on mode
if (transportMode === "http" && process.env.NODE_ENV === "development") {
  // In HTTP development mode, use pretty printing
  loggerConfig.transport = {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "HH:MM:ss Z",
      ignore: "pid,hostname",
    },
  };
}

// Create logger with stderr destination in stdio mode
const logger = transportMode === "stdio"
  ? pino(loggerConfig, pino.destination({ dest: 2 })) // dest: 2 = stderr
  : pino(loggerConfig);

// Initialize OpenTelemetry (must be done before any other imports that might be instrumented)
initializeOpenTelemetry(mcpConfig, logger);

async function main() {
  try {
    // Compose DI container with the properly configured logger
    logger.info("Composing dependency injection container");
    composeContainer(logger);

    if (transportMode === "stdio") {
      // Stdio mode for local MCP client testing (e.g., Claude Desktop)
      logger.info("Starting in stdio mode");

      // In stdio mode, credentials come from env vars
      const stdioSessionId = "stdio";
      const hasCredentials = setupStdioCredentials(stdioSessionId);
      if (!hasCredentials) {
        throw new Error(
          "No service account credentials found for stdio mode. " +
            "Set SERVICE_ACCOUNT_JSON or SERVICE_ACCOUNT_FILE."
        );
      }

      const server = await createMcpServer(logger, stdioSessionId);
      await runStdioServer(server, logger);

      // Graceful shutdown for stdio mode
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
      // HTTP/SSE mode for web clients and production
      logger.info("Starting in HTTP mode with SSE transport");

      const { app, shutdown } = createMcpHttpServer(mcpConfig, logger);
      const { host, port } = mcpConfig;

      const httpServer: http.Server = app.listen(port, host, () => {
        logger.info({ host, port }, "DBM MCP Server started");
        logger.info(
          `Server is ready to accept MCP connections via SSE at http://${host}:${port}/mcp`
        );
      });

      // Graceful shutdown for HTTP mode
      let shuttingDown = false;
      const handleHttpShutdown = async (signal: string) => {
        if (shuttingDown) return;
        shuttingDown = true;

        logger.info({ signal }, "Shutting down gracefully...");

        // 1. Stop accepting new connections
        httpServer.close((err) => {
          if (err) {
            logger.error({ err }, "Error closing HTTP server");
          } else {
            logger.info("HTTP server closed – no longer accepting connections");
          }
        });

        // 2. Close all active SSE transports
        await shutdown();

        // 3. Allow brief window for in-flight requests to complete, then exit
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
 * Creates a GoogleAuthAdapter and session services for the "stdio" session.
 */
function setupStdioCredentials(sessionId: string): boolean {
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

  const services = createSessionServices(authAdapter, mcpConfig, logger);
  sessionServiceStore.set(sessionId, services);
  logger.info("Stdio session services created successfully");
  return true;
}

main();
