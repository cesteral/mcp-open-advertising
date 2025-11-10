import "reflect-metadata";
import { setupContainer } from "./container/index.js";
import { createMcpHttpServer } from "./mcp-server/transports/http-transport.js";
import { mcpConfig } from "./config/index.js";
import { createLogger } from "@bidshifter/shared";

const logger = createLogger("dbm-mcp");

async function main() {
  try {
    // Setup DI container
    setupContainer();
    logger.info("DI container configured");

    // Create and start HTTP server
    const app = createMcpHttpServer();

    app.listen(mcpConfig.port, mcpConfig.host, () => {
      logger.info(
        {
          host: mcpConfig.host,
          port: mcpConfig.port,
          nodeEnv: mcpConfig.nodeEnv,
        },
        "DBM MCP Server started"
      );
      logger.info(`Health check: http://${mcpConfig.host}:${mcpConfig.port}/health`);
      logger.info(`SSE endpoint: http://${mcpConfig.host}:${mcpConfig.port}/sse`);
    });
  } catch (error) {
    logger.error({ error }, "Failed to start server");
    process.exit(1);
  }
}

main();
