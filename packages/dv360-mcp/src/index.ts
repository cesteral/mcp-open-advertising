import "reflect-metadata";
import { createLogger } from "@bidshifter/shared";
import { mcpConfig } from "./config/index.js";
import { composeContainer } from "./container/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { createMcpHttpServer } from "./mcp-server/transports/http-transport.js";
import { initializeOpenTelemetry } from "./utils/telemetry/index.js";

const logger = createLogger("dv360-mcp");

// Initialize OpenTelemetry (must be done before any other imports that might be instrumented)
initializeOpenTelemetry(mcpConfig, logger);

async function main() {
  try {
    // Compose DI container
    logger.info("Composing dependency injection container");
    composeContainer();

    // Determine transport mode based on environment
    const transportMode = process.env.MCP_TRANSPORT_MODE || "http";

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
