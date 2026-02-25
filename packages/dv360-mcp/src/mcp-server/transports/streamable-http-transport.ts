/**
 * Streamable HTTP Transport for DV360-MCP
 *
 * Implements MCP Specification 2025-11-25 Streamable HTTP Transport.
 * Uses Hono + @hono/mcp for the Streamable HTTP transport.
 */
import { readFileSync } from "fs";
import { join } from "node:path";
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
  isValidSessionId,
  generateSessionId,
  validateProtocolVersion,
  SUPPORTED_PROTOCOL_VERSIONS,
  buildAllowedOrigins,
  extractHeadersMap,
  validateSessionReuse,
  oauthProtectedResourceBody,
  SessionManager,
  createFindingStore,
  resolveStorageBackend,
  type AuthMode,
  type GoogleAuthAdapter,
} from "@cesteral/shared";
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

  const storageBackend = config.gcsBucketName
    ? resolveStorageBackend({ gcsBucket: config.gcsBucketName, gcsPrefix: "dv360-mcp" })
    : undefined;

  const findingStore = createFindingStore({
    filePath: storageBackend
      ? "findings/dv360-mcp-findings.jsonl"
      : join(process.cwd(), "data", "findings", "dv360-mcp-findings.jsonl"),
    retentionDays: 30,
    logger,
    storageBackend,
  });
  findingStore.prune().catch((error) => {
    logger.warn({ error }, "Failed to prune finding store on startup");
  });

  const sessionTransports = new Map<string, McpSessionTransport>();

  const sessions = new SessionManager<Awaited<ReturnType<typeof createMcpServer>>>(
    sessionServiceStore,
    {
      onBeforeCleanup: async (sessionId: string) => {
        const transport = sessionTransports.get(sessionId);
        if (transport) {
          await transport.close?.().catch(() => {});
          sessionTransports.delete(sessionId);
        }

        const services = sessionServiceStore.get(sessionId);
        if (!services?.findingBuffer) return;
        const findings = services.findingBuffer.clear();
        if (findings.length > 0) {
          await findingStore.append(findings);
        }
      },
    }
  );

  // Register active sessions gauge
  registerActiveSessionsGauge(() => sessionServiceStore.size);

  // -----------------------------------------------------------------------
  // CORS
  // -----------------------------------------------------------------------
  const allowedOrigin = buildAllowedOrigins(config.mcpAllowedOrigins, config.nodeEnv, logger);
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
  // -----------------------------------------------------------------------
  app.get("/.well-known/oauth-protected-resource", (c) => {
    const { body, status } = oauthProtectedResourceBody(config.mcpAuthMode, c.req.url);
    return c.json(body, status as 200);
  });

  // -----------------------------------------------------------------------
  // GET /mcp — 405 Method Not Allowed
  // -----------------------------------------------------------------------
  app.get("/mcp", (c) => {
    return c.body(null, 405);
  });

  // -----------------------------------------------------------------------
  // DELETE /mcp — session termination
  // -----------------------------------------------------------------------
  app.delete("/mcp", async (c) => {
    const sessionId = c.req.header("mcp-session-id");
    if (!sessionId) {
      return c.json({ error: "Mcp-Session-Id header required" }, 400);
    }

    const storedFingerprint = sessionServiceStore.getFingerprint(sessionId);
    if (storedFingerprint) {
      try {
        const headers = extractHeadersMap(c.req.raw.headers);
        const requestFingerprint = authStrategy.getCredentialFingerprint
          ? await authStrategy.getCredentialFingerprint(headers)
          : undefined;
        if (requestFingerprint && requestFingerprint !== storedFingerprint) {
          logger.warn(
            { sessionId, event: "unauthorized_session_termination" },
            "Session termination rejected — credential mismatch"
          );
          return c.json({ error: "Session credential mismatch" }, 401);
        }
      } catch {
        return c.json({ error: "Authentication required for session termination" }, 401);
      }
    }

    logger.info({ sessionId }, "Session termination requested");
    await sessions.cleanupSession(sessionId);
    return c.json({ status: "terminated", sessionId }, 200);
  });

  // -----------------------------------------------------------------------
  // POST /mcp — JSON-RPC over Streamable HTTP
  // -----------------------------------------------------------------------
  app.post("/mcp", async (c) => {
    const requestId = extractRequestId(extractHeadersMap(c.req.raw.headers));
    const reqCtx = createRequestContext(config.serviceName);
    reqCtx.requestId = requestId;

    return runWithRequestContext(reqCtx, async () => {

    // Validate MCP-Protocol-Version header
    const protocolVersion =
      c.req.header("mcp-protocol-version") ?? "2025-03-26";
    if (!validateProtocolVersion(protocolVersion)) {
      logger.warn(
        { protocolVersion, supportedVersions: SUPPORTED_PROTOCOL_VERSIONS },
        "Unsupported MCP protocol version"
      );
      return c.json(
        {
          error: "Unsupported MCP protocol version",
          protocolVersion,
          supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
        },
        400
      );
    }

    // Get or create session
    const providedSessionId = c.req.header("mcp-session-id");
    if (providedSessionId && !isValidSessionId(providedSessionId)) {
      return c.json({ error: "Invalid session ID format" }, 400);
    }

    if (providedSessionId && !sessionServiceStore.get(providedSessionId)) {
      return c.json({ error: "Session not found or expired" }, 404);
    }

    if (providedSessionId) {
      const headers = extractHeadersMap(c.req.raw.headers);
      const reuseResult = await validateSessionReuse(
        authStrategy,
        sessionServiceStore,
        headers,
        providedSessionId
      );
      if (!reuseResult.valid) {
        const auditLogger = logger.child({ component: "audit" });
        auditLogger.warn(
          {
            event: "session_fingerprint_mismatch",
            sessionId: providedSessionId,
            storedFingerprint: reuseResult.storedFingerprint,
            requestFingerprint: reuseResult.requestFingerprint,
          },
          reuseResult.reason ?? "Session credential mismatch"
        );
        return c.json({ error: "Session credential mismatch" }, 401);
      }
    }

    // Check session capacity — only for new sessions (existing sessions must not be blocked)
    if (!providedSessionId && sessionServiceStore.isFull()) {
      logger.warn(
        { activeSessions: sessionServiceStore.size },
        "Max session capacity reached"
      );
      return c.json(
        { error: "Server at capacity. Please try again later." },
        503
      );
    }

    // For new sessions, authenticate via configured strategy
    let sessionId = providedSessionId;
    if (!sessionId) {
      const headers = extractHeadersMap(c.req.raw.headers);

      let authResult;
      try {
        authResult = await authStrategy.verify(headers);
        recordAuthValidation(authResult.authInfo.authType, "success");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Authentication failed";
        recordAuthValidation(config.mcpAuthMode, "failure");
        logger.warn({ error: message }, "Authentication failed");
        return c.json(
          {
            error: message,
            hint: config.mcpAuthMode === "google-headers"
              ? "Provide Google credentials via X-Google-Auth-Type and associated headers."
              : "Provide a valid Bearer token in the Authorization header.",
          },
          401
        );
      }

      sessionId = generateSessionId();

      const adapter = authResult.googleAuthAdapter as GoogleAuthAdapter | undefined;
      if (adapter) {
        await adapter.validate();
        const services = createSessionServices(
          adapter,
          config.dv360ApiBaseUrl,
          logger,
          rateLimiter
        );
        sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
        sessionServiceStore.setAuthContext(sessionId, {
          authInfo: authResult.authInfo,
          credentialFingerprint: authResult.credentialFingerprint,
          allowedAdvertisers: authResult.allowedAdvertisers,
        });
      } else {
        return c.json(
          { error: "Google API credentials required for this server. Use MCP_AUTH_MODE=google-headers." },
          400
        );
      }
      sessions.trackSession(sessionId);

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

    // Get or create cached MCP server for this session
    let mcpServer = sessions.getServer(sessionId);
    if (!mcpServer) {
      mcpServer = await createMcpServer(logger, sessionId, { findingStore, storageBackend });
      sessions.setServer(sessionId, mcpServer);
      logger.debug({ sessionId }, "Created new MCP server instance for session");
    }

    // Use one connected transport per session to avoid reconnecting a server protocol instance.
    let transport = sessionTransports.get(sessionId);
    try {
      if (!transport) {
        transport = new McpSessionTransport(sessionId);
        await mcpServer.connect(transport);
        sessionTransports.set(sessionId, transport);
      }

      const response = await transport.handleRequest(c);

      if (response) {
        response.headers.set("Mcp-Session-Id", sessionId);
        return response;
      }
      return c.body(null, 204);
    } catch (error) {
      logger.error({ error, sessionId, requestId }, "Error handling MCP request");
      await transport?.close?.().catch(() => {});
      sessionTransports.delete(sessionId);
      throw error;
    }

    }); // end runWithRequestContext
  });

  // Start session timeout sweep
  sessions.startSweep(config.mcpStatefulSessionTimeoutMs, logger);

  return { app, shutdown: () => sessions.shutdown() };
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
