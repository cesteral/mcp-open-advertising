import "reflect-metadata";
import { createLogger } from "@bidshifter/shared";
import { mcpConfig } from "./config/index.js";
import { setupContainer } from "./container/index.js";
import express from "express";

const logger = createLogger("bidshifter-mcp");

async function main() {
  try {
    // Setup dependency injection container
    setupContainer(logger);

    const app = express();
    app.use(express.json());

    app.get("/health", (_req, res) => {
      res.json({ status: "healthy", service: "bidshifter-mcp" });
    });

    app.listen(mcpConfig.port, mcpConfig.host, () => {
      logger.info({ host: mcpConfig.host, port: mcpConfig.port }, "BidShifter MCP Server started");
      logger.info("MCP server implementation pending - stub server only");
      logger.info("PacingService registered and available for optimization tools");
    });
  } catch (error) {
    logger.error({ error }, "Failed to start server");
    process.exit(1);
  }
}

main();
