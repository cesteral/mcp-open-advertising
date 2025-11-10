import "reflect-metadata";
import { createLogger } from "@bidshifter/shared";
import { mcpConfig } from "./config/index.js";
import express from "express";

const logger = createLogger("dv360-mcp");

async function main() {
  try {
    const app = express();
    app.use(express.json());

    app.get("/health", (_req, res) => {
      res.json({ status: "healthy", service: "dv360-mcp" });
    });

    app.listen(mcpConfig.port, mcpConfig.host, () => {
      logger.info({ host: mcpConfig.host, port: mcpConfig.port }, "DV360 MCP Server started");
      logger.info("MCP server implementation pending - stub server only");
    });
  } catch (error) {
    logger.error({ error }, "Failed to start server");
    process.exit(1);
  }
}

main();
