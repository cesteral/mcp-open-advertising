/**
 * Shared MCP HTTP Transport Factory
 *
 * Eliminates ~380 lines of duplicated transport boilerplate across the 5 MCP
 * servers. Each server provides a small configuration object with
 * platform-specific hooks (auth strategy, CORS headers, session creation).
 */

import { readFileSync } from "fs";

import { StreamableHTTPTransport } from "@hono/mcp";
import { type ServerType, serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import type { Logger } from "pino";

import {
  createRequestContext,
  runWithRequestContext,
  extractRequestId,
} from "./request-context.js";
import { registerActiveSessionsGauge, recordAuthValidation } from "./metrics.js";
import {
  isValidSessionId,
  generateSessionId,
  validateProtocolVersion,
  SUPPORTED_PROTOCOL_VERSIONS,
  buildAllowedOrigins,
  extractHeadersMap,
  validateSessionReuse,
  oauthProtectedResourceBody,
  SessionManager,
} from "./mcp-transport-helpers.js";
import type { AuthStrategy, AuthResult, SessionAuthContext } from "../auth/auth-strategy.js";
import type { SessionServiceStoreLike } from "./mcp-transport-helpers.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

class McpSessionTransport extends StreamableHTTPTransport {
  public sessionId: string;
  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
  }
}

type HonoBindings = {
  incoming: import("http").IncomingMessage;
  outgoing: import("http").ServerResponse;
};

export interface McpHttpServer {
  server: ServerType;
  shutdown: () => Promise<void>;
}

/**
 * Minimal interface that the session service store must satisfy.
 * Matches SessionServiceStore from session-store.ts.
 */
export interface TransportSessionStore extends SessionServiceStoreLike {
  get(sessionId: string): unknown;
  set(sessionId: string, services: unknown, fingerprint?: string): void;
  setAuthContext(sessionId: string, ctx: SessionAuthContext): void;
  getFingerprint(sessionId: string): string | undefined;
  validateFingerprint(sessionId: string, fingerprint: string): boolean;
  isFull(): boolean;
}

/**
 * Result of the platform-specific session creation callback.
 */
export interface SessionCreationResult {
  /** The session services object to store. */
  services: unknown;
  /** HTTP error to return if session creation fails — omit on success. */
  error?: { message: string; status: 400 | 401 };
}

/**
 * Configuration for the shared transport factory.
 * Each MCP server provides these platform-specific hooks.
 */
export interface TransportFactoryConfig {
  /** The auth strategy instance for this server. */
  authStrategy: AuthStrategy;
  /** CORS allow headers specific to this platform. */
  corsAllowHeaders: string[];
  /** Auth error hint shown when authentication fails. */
  authErrorHint: string;
  /** The session service store for this server. */
  sessionServiceStore: TransportSessionStore;
  /** Rate limiter instance (unused by the factory, but available for session creation). */
  rateLimiter?: unknown;
  /**
   * Create session services from the auth result.
   * Called when a new session is created. Must call sessionServiceStore.set() internally.
   * Return { error } to reject the connection, or { services } on success.
   */
  createSessionForAuth: (
    authResult: AuthResult,
    sessionId: string,
    config: TransportFactoryAppConfig,
    logger: Logger
  ) => Promise<SessionCreationResult>;
  /**
   * Create the MCP server instance for a session.
   */
  createMcpServer: (logger: Logger, sessionId: string, gcsBucket?: string) => Promise<McpServerLike>;
  /** Absolute path to the server's package.json (for version in /health). */
  packageJsonPath: string;
  /** Platform display name for the startup log message (e.g. "DBM", "TTD"). */
  platformDisplayName: string;
}

/** Minimal MCP server interface required by the factory. */
interface McpServerLike {
  connect(transport: StreamableHTTPTransport): Promise<void>;
  close(): Promise<void>;
}

/** Minimal app config shape used by the factory. */
export interface TransportFactoryAppConfig {
  serviceName: string;
  nodeEnv: string;
  port: number;
  host: string;
  mcpAuthMode: string;
  mcpAuthSecretKey?: string;
  mcpAllowedOrigins?: string;
  mcpStatefulSessionTimeoutMs: number;
  gcsBucketName?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMcpHttpTransport(
  config: TransportFactoryAppConfig,
  logger: Logger,
  platformConfig: TransportFactoryConfig
): { app: Hono<{ Bindings: HonoBindings }>; shutdown: () => Promise<void> } {
  const app = new Hono<{ Bindings: HonoBindings }>();
  const sessionTransports = new Map<string, McpSessionTransport>();
  const { sessionServiceStore, authStrategy } = platformConfig;

  let pkg: { version: string };
  try {
    pkg = JSON.parse(readFileSync(platformConfig.packageJsonPath, "utf-8"));
  } catch {
    logger.warn(
      { path: platformConfig.packageJsonPath },
      "Failed to read package.json for version info, using fallback"
    );
    pkg = { version: "unknown" };
  }

  const sessions = new SessionManager<McpServerLike>(
    sessionServiceStore,
    {
      onBeforeCleanup: async (sessionId: string) => {
        const transport = sessionTransports.get(sessionId);
        if (transport) {
          await transport.close?.().catch(() => {});
          sessionTransports.delete(sessionId);
        }
      },
    }
  );

  registerActiveSessionsGauge(() => sessionServiceStore.size);

  // CORS
  const allowedOrigin = buildAllowedOrigins(config.mcpAllowedOrigins, config.nodeEnv, logger);
  app.use(
    "*",
    cors({
      origin: allowedOrigin,
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: platformConfig.corsAllowHeaders,
      exposeHeaders: ["Mcp-Session-Id"],
      credentials: true,
    })
  );

  // DNS rebinding protection
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

  // Health endpoint
  app.get("/health", (c) => {
    return c.json({
      status: "healthy",
      service: config.serviceName,
      version: pkg.version,
      mode: "streamable-http",
      activeSessions: sessionServiceStore.size,
    });
  });

  // RFC 9728 Protected Resource Metadata
  app.get("/.well-known/oauth-protected-resource", (c) => {
    const { body, status } = oauthProtectedResourceBody(config.mcpAuthMode, c.req.url);
    return c.json(body, status as 200);
  });

  // GET /mcp — 405 Method Not Allowed
  app.get("/mcp", (c) => {
    return c.body(null, 405);
  });

  // DELETE /mcp — session termination
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
            "Session termination rejected - credential mismatch"
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

  // Request body size limit (10 MB)
  app.post("*", bodyLimit({ maxSize: 10 * 1024 * 1024 }));

  // POST /mcp — JSON-RPC over Streamable HTTP
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

    if (providedSessionId && !sessionServiceStore.get(providedSessionId) && !sessions.sessionCreatedAt.has(providedSessionId)) {
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
      // Extend idle timeout on every request from an existing session
      sessions.touchSession(providedSessionId);
    }

    // Check session capacity — only for new sessions
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

      let authResult: AuthResult;
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
            hint: platformConfig.authErrorHint,
          },
          401
        );
      }

      sessionId = generateSessionId();

      // Platform-specific session creation
      const result = await platformConfig.createSessionForAuth(
        authResult,
        sessionId,
        config,
        logger
      );

      if (result.error) {
        return c.json({ error: result.error.message }, result.error.status);
      }

      sessionServiceStore.setAuthContext(sessionId, {
        authInfo: authResult.authInfo,
        credentialFingerprint: authResult.credentialFingerprint,
        allowedAdvertisers: authResult.allowedAdvertisers,
      });

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
      mcpServer = await platformConfig.createMcpServer(logger, sessionId, config.gcsBucketName);
      sessions.setServer(sessionId, mcpServer);
      logger.debug({ sessionId }, "Created new MCP server instance for session");
    }

    // Use one connected transport per session
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
export async function startMcpHttpServer(
  config: TransportFactoryAppConfig,
  logger: Logger,
  platformConfig: TransportFactoryConfig
): Promise<McpHttpServer> {
  if (config.mcpAuthMode === "none") {
    logger.warn(
      "MCP_AUTH_MODE=none — server has no authentication. " +
      "Sessions without platform credentials will accept protocol messages but tool calls will fail at runtime. " +
      "This mode is intended for local development only."
    );
  }

  const { app, shutdown } = createMcpHttpTransport(config, logger, platformConfig);

  const server = serve(
    {
      fetch: app.fetch,
      port: config.port,
      hostname: config.host,
    },
    (info) => {
      logger.info(
        { host: info.address, port: info.port },
        `${platformConfig.platformDisplayName} MCP Server listening at http://${info.address}:${info.port}/mcp`
      );
    }
  );

  return { server, shutdown };
}
