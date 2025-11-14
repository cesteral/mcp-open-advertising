import "reflect-metadata";
import { createLogger } from "@bidshifter/shared";
import { mcpConfig } from "./config/index.js";
import { composeContainer } from "./container/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { initializeOpenTelemetry } from "./utils/telemetry/index.js";
import express from "express";
import type { Request, Response } from "express";

const logger = createLogger("dv360-mcp");

// Initialize OpenTelemetry (must be done before any other imports that might be instrumented)
initializeOpenTelemetry(mcpConfig, logger);

// Store active SSE transports by session ID
const activeTransports = new Map<string, SSEServerTransport>();

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

      const app = express();
      app.use(express.json());
      app.use(express.text());

      // Health check endpoint
      app.get("/health", (_req: Request, res: Response) => {
        res.json({
          status: "healthy",
          service: "dv360-mcp",
          version: "1.0.0",
          mode: "http-sse",
          activeSessions: activeTransports.size,
        });
      });

      // SSE endpoint - establish connection
      app.get("/mcp", async (_req: Request, res: Response) => {
        logger.info("SSE connection request");

        try {
          // Create a new MCP server instance for this session
          const server = createMcpServer(logger);

          // Create SSE transport
          const transport = new SSEServerTransport("/mcp", res);

          // Store transport by session ID
          activeTransports.set(transport.sessionId, transport);

          // Clean up on close
          transport.onclose = () => {
            logger.info({ sessionId: transport.sessionId }, "SSE connection closed");
            activeTransports.delete(transport.sessionId);
          };

          // Connect server to transport
          await server.connect(transport);

          logger.info(
            { sessionId: transport.sessionId, activeSessions: activeTransports.size },
            "SSE connection established"
          );
        } catch (error) {
          logger.error({ error }, "Failed to establish SSE connection");
          if (!res.headersSent) {
            res.status(500).json({ error: "Failed to establish SSE connection" });
          }
        }
      });

      // POST endpoint - receive messages
      app.post("/mcp", async (req: Request, res: Response): Promise<any> => {
        const sessionId = req.query.sessionId as string;

        if (!sessionId) {
          logger.warn("POST request missing sessionId");
          return res.status(400).json({ error: "Missing sessionId query parameter" });
        }

        const transport = activeTransports.get(sessionId);
        if (!transport) {
          logger.warn({ sessionId }, "Session not found");
          res.status(404).json({ error: "Session not found" });
          return;
        }

        try {
          // Parse body based on content type
          const body =
            typeof req.body === "string" ? JSON.parse(req.body) : req.body;

          await transport.handlePostMessage(req, res, body);
        } catch (error) {
          logger.error({ error, sessionId }, "Failed to handle POST message");
          if (!res.headersSent) {
            res.status(500).json({ error: "Failed to process message" });
          }
        }
      });

      // Start HTTP server
      const port = mcpConfig.port;
      const host = mcpConfig.host;

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
