/**
 * Streamable HTTP Transport for DV360-MCP
 *
 * Implements MCP Specification 2025-03-26 Streamable HTTP Transport.
 * Replaces the deprecated SSE transport with Hono + @hono/mcp.
 */
import { readFileSync } from "fs";
import { StreamableHTTPTransport } from "@hono/mcp";
import { type ServerType, serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Logger } from "pino";
import type { AppConfig } from "../../config/index.js";
import { createMcpServer } from "../server.js";
import {
  createRequestContext,
  runWithRequestContext,
  extractRequestId,
  registerActiveSessionsGauge,
  recordAuthValidation,
  createAuthStrategy,
  type AuthMode,
  type GoogleAuthAdapter,
} from "@bidshifter/shared";
import {
  createSessionServices,
  sessionServiceStore,
} from "../../services/session-services.js";
import { rateLimiter } from "../../utils/security/rate-limiter.js";

// ---------------------------------------------------------------------------
// Read package version at module level
// ---------------------------------------------------------------------------
const pkg: { version: string } = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf-8")
);

// ---------------------------------------------------------------------------
// Session ID validation
// ---------------------------------------------------------------------------
const SESSION_ID_PATTERN = /^[a-f0-9-]{20,100}$/i;
function isValidSessionId(id: string): boolean {
  return SESSION_ID_PATTERN.test(id);
}

// ---------------------------------------------------------------------------
// Session transport wrapper
// ---------------------------------------------------------------------------
class McpSessionTransport extends StreamableHTTPTransport {
  public sessionId: string;
  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type HonoBindings = {
  incoming: import("http").IncomingMessage;
  outgoing: import("http").ServerResponse;
};

export interface McpHttpServer {
  server: ServerType;
  shutdown: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Main transport factory
// ---------------------------------------------------------------------------
export function createMcpHttpServer(
  config: AppConfig,
  logger: Logger
): { app: Hono<{ Bindings: HonoBindings }>; shutdown: () => Promise<void> } {
  const app = new Hono<{ Bindings: HonoBindings }>();

  // Track active sessions for timeout sweep
  const sessionCreatedAt = new Map<string, number>();

  // Register active sessions gauge
  registerActiveSessionsGauge(() => sessionServiceStore.size);

  // -----------------------------------------------------------------------
  // CORS
  // -----------------------------------------------------------------------
  const allowedOrigin = buildAllowedOrigins(config, logger);
  app.use(
    "*",
    cors({
      origin: allowedOrigin,
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "Mcp-Session-Id",
        "MCP-Protocol-Version",
        "X-Google-Auth-Type",
        "X-Google-Credentials",
        "X-Google-Client-Id",
        "X-Google-Client-Secret",
        "X-Google-Refresh-Token",
      ],
      exposeHeaders: ["Mcp-Session-Id"],
      credentials: true,
    })
  );

  // -----------------------------------------------------------------------
  // DNS rebinding protection
  // -----------------------------------------------------------------------
  app.use("/mcp", async (c, next) => {
    const origin = c.req.header("origin");
    if (origin && allowedOrigin !== "*") {
      const isAllowed =
        Array.isArray(allowedOrigin) && allowedOrigin.includes(origin);
      if (!isAllowed) {
        logger.warn(
          { origin, allowedOrigins: allowedOrigin },
          "Rejected request with invalid Origin header"
        );
        return c.json(
          { error: "Invalid origin. DNS rebinding protection." },
          403
        );
      }
    }
    return await next();
  });

  // -----------------------------------------------------------------------
  // Health endpoint
  // -----------------------------------------------------------------------
  app.get("/health", (c) => {
    return c.json({
      status: "healthy",
      service: config.serviceName,
      version: pkg.version,
      mode: "streamable-http",
      activeSessions: sessionServiceStore.size,
    });
  });

  // -----------------------------------------------------------------------
  // Auth strategy
  // -----------------------------------------------------------------------
  const authStrategy = createAuthStrategy(config.mcpAuthMode as AuthMode, {
    scopes: ["https://www.googleapis.com/auth/display-video"],
    jwtSecret: config.mcpAuthSecretKey,
    logger,
  });

  // -----------------------------------------------------------------------
  // RFC 9728 Protected Resource Metadata
  // Must be accessible without authentication for discovery.
  // -----------------------------------------------------------------------
  app.get("/.well-known/oauth-protected-resource", (c) => {
    if (config.mcpAuthMode === "jwt") {
      return c.json({
        resource: `${c.req.url.replace("/.well-known/oauth-protected-resource", "")}`,
        bearer_methods_supported: ["header"],
        scopes_supported: [],
      });
    }
    return c.json(
      { error: "OAuth not configured on this server" },
      404
    );
  });

  // -----------------------------------------------------------------------
  // GET /mcp — server info (no auth required)
  // -----------------------------------------------------------------------
  app.get("/mcp", (c) => {
    return c.json({
      status: "ok",
      server: {
        name: config.serviceName,
        version: pkg.version,
        transport: "streamable-http",
        sessionMode: config.mcpSessionMode,
      },
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /mcp — session termination
  // -----------------------------------------------------------------------
  app.delete("/mcp", (c) => {
    const sessionId = c.req.header("mcp-session-id");
    if (!sessionId) {
      return c.json({ error: "Mcp-Session-Id header required" }, 400);
    }
    logger.info({ sessionId }, "Session termination requested");
    sessionServiceStore.delete(sessionId);
    sessionCreatedAt.delete(sessionId);
    return c.json({ status: "terminated", sessionId }, 200);
  });

  // -----------------------------------------------------------------------
  // POST /mcp — JSON-RPC over Streamable HTTP
  // -----------------------------------------------------------------------
  app.post("/mcp", async (c) => {
    // Establish request context for correlation
    const requestId = extractRequestId(
      Object.fromEntries([...c.req.raw.headers.entries()].map(([k, v]) => [k, v]))
    );
    const reqCtx = createRequestContext(config.serviceName);
    reqCtx.requestId = requestId;

    return runWithRequestContext(reqCtx, async () => {

    // Validate MCP-Protocol-Version header
    const protocolVersion =
      c.req.header("mcp-protocol-version") ?? "2025-03-26";
    const supportedVersions = ["2025-03-26", "2025-06-18"];
    if (!supportedVersions.includes(protocolVersion)) {
      logger.warn(
        { protocolVersion, supportedVersions },
        "Unsupported MCP protocol version"
      );
      return c.json(
        {
          error: "Unsupported MCP protocol version",
          protocolVersion,
          supportedVersions,
        },
        400
      );
    }

    // Check session capacity
    if (sessionServiceStore.isFull()) {
      logger.warn(
        { activeSessions: sessionServiceStore.size },
        "Max session capacity reached"
      );
      return c.json(
        { error: "Server at capacity. Please try again later." },
        503
      );
    }

    // Get or create session
    const providedSessionId = c.req.header("mcp-session-id");
    if (providedSessionId && !isValidSessionId(providedSessionId)) {
      return c.json({ error: "Invalid session ID format" }, 400);
    }

    // If existing session, validate it exists
    if (providedSessionId && !sessionServiceStore.get(providedSessionId)) {
      return c.json({ error: "Session not found or expired" }, 404);
    }

    // For new sessions, authenticate via configured strategy
    let sessionId = providedSessionId;
    if (!sessionId) {
      const headers = Object.fromEntries(
        [...c.req.raw.headers.entries()].map(([k, v]) => [k, v])
      );

      let authResult;
      try {
        authResult = await authStrategy.verify(headers);
        recordAuthValidation(authResult.authInfo.authType, "success");
      } catch (error: any) {
        recordAuthValidation(config.mcpAuthMode, "failure");
        logger.warn({ error: error.message }, "Authentication failed");
        return c.json(
          {
            error: error.message,
            hint: config.mcpAuthMode === "google-headers"
              ? "Provide Google credentials via X-Google-Auth-Type and associated headers."
              : "Provide a valid Bearer token in the Authorization header.",
          },
          401
        );
      }

      // Generate session ID and create session services
      const { randomBytes } = await import("crypto");
      sessionId = randomBytes(32).toString("hex");

      // For google-headers mode, the adapter is returned for API calls
      const adapter = authResult.googleAuthAdapter as GoogleAuthAdapter | undefined;
      if (adapter) {
        const services = createSessionServices(
          adapter,
          config.dv360ApiBaseUrl,
          logger,
          rateLimiter
        );
        sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
      } else {
        return c.json(
          { error: "Google API credentials required for this server. Use MCP_AUTH_MODE=google-headers." },
          400
        );
      }
      sessionCreatedAt.set(sessionId, Date.now());

      logger.info(
        {
          sessionId,
          activeSessions: sessionServiceStore.size,
          authType: authResult.authInfo.authType,
          clientId: authResult.authInfo.clientId,
        },
        "New MCP session created"
      );
    }

    // Create transport and handle request
    const transport = new McpSessionTransport(sessionId);
    try {
      const server = await createMcpServer(logger, sessionId);
      await server.connect(transport);
      const response = await transport.handleRequest(c);

      // Add session ID header for stateful sessions
      if (response) {
        response.headers.set("Mcp-Session-Id", sessionId);
        return response;
      }
      return c.body(null, 204);
    } catch (error) {
      logger.error({ error, sessionId, requestId }, "Error handling MCP request");
      await transport.close?.().catch(() => {});
      throw error;
    }

    }); // end runWithRequestContext
  });

  // -----------------------------------------------------------------------
  // Session timeout sweep
  // -----------------------------------------------------------------------
  const timeoutMs = config.mcpStatefulSessionTimeoutMs;
  const sweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [sessionId, createdAt] of sessionCreatedAt) {
      if (now - createdAt > timeoutMs) {
        logger.info(
          { sessionId, ageMs: now - createdAt },
          "Session timed out — cleaning up"
        );
        sessionServiceStore.delete(sessionId);
        sessionCreatedAt.delete(sessionId);
      }
    }
  }, 60_000);
  sweepInterval.unref();

  // -----------------------------------------------------------------------
  // Shutdown helper
  // -----------------------------------------------------------------------
  async function shutdown(): Promise<void> {
    clearInterval(sweepInterval);
    // Clean up all sessions
    sessionCreatedAt.clear();
  }

  return { app, shutdown };
}

// ---------------------------------------------------------------------------
// Start the server
// ---------------------------------------------------------------------------
export async function startHttpServer(
  config: AppConfig,
  logger: Logger
): Promise<McpHttpServer> {
  const { app, shutdown } = createMcpHttpServer(config, logger);

  const server = serve(
    {
      fetch: app.fetch,
      port: config.port,
      hostname: config.host,
    },
    (info) => {
      logger.info(
        { host: info.address, port: info.port },
        `DV360 MCP Server listening at http://${info.address}:${info.port}/mcp`
      );
    }
  );

  return { server, shutdown };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildAllowedOrigins(
  config: AppConfig,
  logger: Logger
): string | string[] {
  if (config.mcpAllowedOrigins) {
    const origins = config.mcpAllowedOrigins
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    logger.info({ origins }, "CORS configured with explicit origins");
    return origins;
  }
  if (config.nodeEnv === "production") {
    logger.warn(
      "No MCP_ALLOWED_ORIGINS configured in production — CORS will reject all cross-origin requests. " +
        "Set MCP_ALLOWED_ORIGINS to a comma-separated list of allowed origins."
    );
    return [];
  }
  return "*";
}
