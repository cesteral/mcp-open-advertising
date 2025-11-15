import express, {
  type Application,
  type Request,
  type Response,
} from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { Logger } from "pino";
import type { AppConfig } from "../../config/index.js";
import { createMcpServer } from "../server.js";

/**
 * Creates an Express application configured to expose the MCP server over HTTP + SSE.
 *
 * The implementation mirrors the behaviour previously embedded in the top-level
 * index entry point but encapsulates it behind a reusable function so that
 * transports can be composed in a consistent way across MCP services.
 */
export function createMcpHttpServer(
  config: AppConfig,
  logger: Logger
): Application {
  const app = express();
  const activeTransports = new Map<string, SSEServerTransport>();

  app.use(express.json());
  app.use(express.text());

  // Health check endpoint used by Cloud Run and other monitors.
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "healthy",
      service: config.serviceName,
      version: "1.0.0",
      mode: "http-sse",
      activeSessions: activeTransports.size,
    });
  });

  // Establish an SSE session and connect it to a fresh MCP server instance.
  app.get("/mcp", async (_req: Request, res: Response) => {
    logger.info("SSE connection request");

    try {
      const server = createMcpServer(logger);
      const transport = new SSEServerTransport("/mcp", res);

      activeTransports.set(transport.sessionId, transport);

      transport.onclose = () => {
        logger.info({ sessionId: transport.sessionId }, "SSE connection closed");
        activeTransports.delete(transport.sessionId);
      };

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

  // Accept JSON-RPC payloads for the active SSE session.
  app.post("/mcp", async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.query.sessionId as string | undefined;

    if (!sessionId) {
      logger.warn("POST request missing sessionId");
      res.status(400).json({ error: "Missing sessionId query parameter" });
      return;
    }

    const transport = activeTransports.get(sessionId);
    if (!transport) {
      logger.warn({ sessionId }, "Session not found");
      res.status(404).json({ error: "Session not found" });
      return;
    }

    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      await transport.handlePostMessage(req, res, body);
    } catch (error) {
      logger.error({ error, sessionId }, "Failed to handle POST message");

      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to process message" });
      }
    }
  });

  return app;
}
