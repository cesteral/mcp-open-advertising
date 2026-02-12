import { readFileSync } from "fs";
import express, {
  type Application,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { Logger } from "pino";
import type { AppConfig } from "../../config/index.js";
import { createMcpServer } from "../server.js";
import {
  parseCredentialsFromHeaders,
  createGoogleAuthAdapter,
} from "@bidshifter/shared";
import {
  createSessionServices,
  sessionServiceStore,
} from "../../services/session-services.js";

// ---------------------------------------------------------------------------
// Read package version at module level
// ---------------------------------------------------------------------------
const pkg: { version: string } = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf-8")
);

// ---------------------------------------------------------------------------
// Public return type – exposes the Express app plus a cleanup handle
// ---------------------------------------------------------------------------
export interface McpHttpServer {
  /** The Express application, ready to be passed to `http.createServer` or `app.listen`. */
  app: Application;
  /** Active SSE transports keyed by session id. */
  activeTransports: Map<string, SSEServerTransport>;
  /** Call once to tear down background timers and close every open transport. */
  shutdown: () => Promise<void>;
}

/**
 * Creates an Express application configured to expose the MCP server over HTTP + SSE.
 *
 * Users authenticate by providing Google credentials via HTTP headers on the
 * initial SSE connection (GET /mcp). Supported header conventions:
 *
 *   X-Google-Auth-Type: service_account | oauth2
 *   X-Google-Credentials: <base64-encoded-service-account-json>
 *   (or X-Google-Client-Id / X-Google-Client-Secret / X-Google-Refresh-Token for OAuth2)
 */
export function createMcpHttpServer(
  config: AppConfig,
  logger: Logger
): McpHttpServer {
  const app = express();
  const activeTransports = new Map<string, SSEServerTransport>();
  const sessionCreatedAt = new Map<string, number>();

  // -----------------------------------------------------------------------
  // CORS middleware
  // -----------------------------------------------------------------------
  const allowedOrigins = buildAllowedOrigins(config);
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    })
  );

  // -----------------------------------------------------------------------
  // Body parsers
  // -----------------------------------------------------------------------
  app.use(express.json());
  app.use(express.text());

  // -----------------------------------------------------------------------
  // Health check endpoint used by Cloud Run and other monitors.
  // -----------------------------------------------------------------------
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "healthy",
      service: config.serviceName,
      version: pkg.version,
      mode: "http-sse",
      activeSessions: activeTransports.size,
    });
  });

  // -----------------------------------------------------------------------
  // Establish an SSE session and connect it to a fresh MCP server instance.
  // Credentials are extracted from HTTP headers on this initial request.
  // -----------------------------------------------------------------------
  app.get("/mcp", async (req: Request, res: Response) => {
    logger.info("SSE connection request");

    // --- Extract and validate Google credentials from headers ---
    let credentials;
    try {
      credentials = parseCredentialsFromHeaders(
        req.headers as Record<string, string | string[] | undefined>
      );
    } catch (error: any) {
      logger.warn({ error: error.message }, "Credential extraction failed");
      if (!res.headersSent) {
        res.status(401).json({
          error: error.message,
          hint: "Provide Google credentials via X-Google-Auth-Type and associated headers.",
        });
      }
      return;
    }

    // --- Create auth adapter and eagerly validate ---
    const authAdapter = createGoogleAuthAdapter(credentials, [
      "https://www.googleapis.com/auth/doubleclickbidmanager",
    ]);

    try {
      await authAdapter.getAccessToken();
    } catch (error: any) {
      logger.warn({ error: error.message }, "Google credential validation failed");
      if (!res.headersSent) {
        res.status(401).json({
          error: "Google credential validation failed: " + error.message,
          hint: "Check that your service account or OAuth2 credentials are valid.",
        });
      }
      return;
    }

    try {
      const transport = new SSEServerTransport("/mcp", res);

      // --- Create per-session services and store them ---
      const services = createSessionServices(authAdapter, config, logger);
      sessionServiceStore.set(transport.sessionId, services);

      activeTransports.set(transport.sessionId, transport);
      sessionCreatedAt.set(transport.sessionId, Date.now());

      transport.onclose = () => {
        logger.info(
          { sessionId: transport.sessionId },
          "SSE connection closed"
        );
        activeTransports.delete(transport.sessionId);
        sessionCreatedAt.delete(transport.sessionId);
        sessionServiceStore.delete(transport.sessionId);
      };

      const server = await createMcpServer(logger, transport.sessionId);
      await server.connect(transport);

      logger.info(
        {
          sessionId: transport.sessionId,
          activeSessions: activeTransports.size,
          credentialType: authAdapter.credentialType,
        },
        "SSE connection established"
      );
    } catch (error) {
      logger.error({ error }, "Failed to establish SSE connection");

      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to establish SSE connection" });
      }
    }
  });

  // -----------------------------------------------------------------------
  // Accept JSON-RPC payloads for the active SSE session.
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // Session timeout sweep
  // -----------------------------------------------------------------------
  const timeoutMs = config.mcpStatefulSessionTimeoutMs; // default 3 600 000 (1 h)
  const sweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [sessionId, createdAt] of sessionCreatedAt) {
      if (now - createdAt > timeoutMs) {
        logger.info(
          { sessionId, ageMs: now - createdAt },
          "Session timed out – closing transport"
        );
        const transport = activeTransports.get(sessionId);
        if (transport) {
          transport.close().catch((err: unknown) => {
            logger.error(
              { err, sessionId },
              "Error closing timed-out transport"
            );
          });
        }
        activeTransports.delete(sessionId);
        sessionCreatedAt.delete(sessionId);
        sessionServiceStore.delete(sessionId);
      }
    }
  }, 60_000);

  // Don't let the sweep timer prevent the process from exiting naturally.
  sweepInterval.unref();

  // -----------------------------------------------------------------------
  // Shutdown helper
  // -----------------------------------------------------------------------
  async function shutdown(): Promise<void> {
    clearInterval(sweepInterval);

    const closingPromises: Promise<void>[] = [];
    for (const [sessionId, transport] of activeTransports) {
      logger.info({ sessionId }, "Closing transport during shutdown");
      sessionServiceStore.delete(sessionId);
      closingPromises.push(
        transport.close().catch((err: unknown) => {
          logger.error({ err, sessionId }, "Error closing transport");
        })
      );
    }
    await Promise.all(closingPromises);

    activeTransports.clear();
    sessionCreatedAt.clear();
  }

  return { app, activeTransports, shutdown };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive the CORS origin list from configuration.
 *
 * - If `mcpAllowedOrigins` is set, split on commas and trim.
 * - Otherwise allow everything in development and reject all in production.
 */
function buildAllowedOrigins(
  config: AppConfig
): string[] | boolean {
  if (config.mcpAllowedOrigins) {
    return config.mcpAllowedOrigins
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  }
  // No explicit origins configured
  return config.nodeEnv === "production" ? false : true;
}
