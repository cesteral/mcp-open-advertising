import "reflect-metadata";
import pino from "pino";
import { mcpConfig } from "./config/index.js";
import { composeContainer } from "./container/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { createMcpHttpServer } from "./mcp-server/transports/http-transport.js";
import { initializeOpenTelemetry } from "./utils/telemetry/index.js";

// Detect transport mode: if stdin is not a TTY, we're in stdio mode (e.g., Claude Desktop)
const isStdinPiped = !process.stdin.isTTY;
const transportMode = process.env.MCP_TRANSPORT_MODE || (isStdinPiped ? "stdio" : "http");

// Configure logger based on transport mode
// In stdio mode, ALL logs must go to stderr to avoid corrupting MCP protocol on stdout
const loggerConfig: pino.LoggerOptions = {
  name: "dv360-mcp",
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
      const server = createMcpServer(logger);
      await runStdioServer(server, logger);
    } else {
      // HTTP/SSE mode for web clients and production
      logger.info("Starting in HTTP mode with SSE transport");

      const app = createMcpHttpServer(mcpConfig, logger);

      const { host, port } = mcpConfig;

      app.listen(port, host, () => {
        logger.info({ host, port }, "DV360 MCP Server started");
        logger.info(
          `Server is ready to accept MCP connections via SSE at http://${host}:${port}/mcp`
        );
      });
    }
  } catch (error) {
    logger.error({ error }, "Failed to start server");
    process.exit(1);
  }
}

main();
