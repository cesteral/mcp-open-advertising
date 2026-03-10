/**
 * Server Bootstrap Utilities
 *
 * Common boot logic shared by all MCP servers: transport detection,
 * logger creation, main() orchestration, and graceful shutdown.
 */

import pino from "pino";
import type { Logger } from "pino";
import { shutdownOpenTelemetry } from "./telemetry.js";

// ---------------------------------------------------------------------------
// Transport mode detection
// ---------------------------------------------------------------------------

/**
 * Detect whether to run in stdio or HTTP mode.
 * If stdin is not a TTY (piped), default to stdio (e.g., Claude Desktop).
 */
export function detectTransportMode(): "stdio" | "http" {
  const isStdinPiped = !process.stdin.isTTY;
  const envMode = process.env.MCP_TRANSPORT_MODE;
  if (envMode === "stdio" || envMode === "http") return envMode;
  return isStdinPiped ? "stdio" : "http";
}

// ---------------------------------------------------------------------------
// Logger creation
// ---------------------------------------------------------------------------

/**
 * Create a Pino logger configured for the given transport mode.
 *
 * - In stdio mode, logs go to stderr (fd 2) to avoid corrupting MCP protocol on stdout.
 * - In HTTP development mode, uses pino-pretty for readability.
 */
export function createServerLogger(
  name: string,
  transportMode: "stdio" | "http",
  mixin: () => Record<string, string | undefined>
): Logger {
  const loggerConfig: pino.LoggerOptions = {
    name,
    level: process.env.LOG_LEVEL || "info",
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    mixin,
  };

  if (transportMode === "http" && process.env.NODE_ENV === "development") {
    loggerConfig.transport = {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    };
  }

  return transportMode === "stdio"
    ? pino(loggerConfig, pino.destination({ dest: 2 }))
    : pino(loggerConfig);
}

// ---------------------------------------------------------------------------
// Bootstrap orchestrator
// ---------------------------------------------------------------------------

export interface HttpServerResult {
  server: { close(cb?: (err?: Error) => void): void };
  shutdown: () => Promise<void>;
}

/**
 * Bootstrap options. TServer is the concrete MCP server type from each package.
 * The bootstrap only requires `close()` on the server for shutdown handling,
 * but accepts the full server type so createMcpServer/runStdio can use it.
 */
export interface BootstrapOptions<TConfig, TServer extends { close(): Promise<void> }> {
  /** Service name for logging */
  serviceName: string;
  /** Parsed config object */
  config: TConfig;
  /** Logger instance */
  logger: Logger;
  /** Transport mode */
  transportMode: "stdio" | "http";

  // Lifecycle hooks
  /** Initialize OpenTelemetry */
  initOtel: (config: TConfig, logger: Logger) => void;

  // Stdio mode callbacks
  /** Set up stdio session credentials. Return false if credentials are missing and required. */
  setupStdioSession: (sessionId: string) => boolean | void | Promise<boolean | void>;
  /** Create MCP server instance */
  createMcpServer: (logger: Logger, sessionId: string) => Promise<TServer>;
  /** Run the server over stdio transport */
  runStdio: (server: TServer, logger: Logger) => Promise<void>;

  // HTTP mode callback
  /** Start the HTTP server */
  startHttp: (config: TConfig, logger: Logger) => Promise<HttpServerResult>;

  /** Optional cleanup hook called during shutdown (e.g., destroy rate limiter) */
  onShutdown?: () => void;
}

/**
 * Main bootstrap function that orchestrates server startup.
 * Handles transport detection, stdio vs HTTP branching, and graceful shutdown.
 */
export async function bootstrapMcpServer<TConfig, TServer extends { close(): Promise<void> }>(
  opts: BootstrapOptions<TConfig, TServer>
): Promise<void> {
  const { logger, transportMode } = opts;

  // Initialize OpenTelemetry first
  opts.initOtel(opts.config, logger);

  try {
    if (transportMode === "stdio") {
      logger.info("Starting in stdio mode");

      const stdioSessionId = "stdio";
      const result = await opts.setupStdioSession(stdioSessionId);
      if (result === false) {
        throw new Error(
          "No credentials found for stdio mode. " +
          "Check environment variables for required credentials."
        );
      }

      const server = await opts.createMcpServer(logger, stdioSessionId);
      await opts.runStdio(server, logger);

      // Graceful shutdown for stdio mode
      const handleStdioShutdown = async () => {
        logger.info("Received shutdown signal (stdio mode) – closing MCP server");
        opts.onShutdown?.();
        try {
          await server.close();
        } catch (err: unknown) {
          logger.error({ err }, "Error closing MCP server");
        }
        await shutdownOpenTelemetry(logger);
        process.exit(0);
      };

      process.on("SIGTERM", handleStdioShutdown);
      process.on("SIGINT", handleStdioShutdown);
    } else {
      logger.info("Starting in HTTP mode with Streamable HTTP transport");

      const { server: httpServer, shutdown } = await opts.startHttp(opts.config, logger);

      // Graceful shutdown for HTTP mode
      let shuttingDown = false;
      const handleHttpShutdown = async (signal: string) => {
        if (shuttingDown) return;
        shuttingDown = true;

        logger.info({ signal }, "Shutting down gracefully...");

        // 1. Stop accepting new connections
        httpServer.close((err) => {
          if (err) {
            logger.error({ err }, "Error closing HTTP server");
          } else {
            logger.info("HTTP server closed – no longer accepting connections");
          }
        });

        // 2. Clean up sessions and resources
        await shutdown();
        opts.onShutdown?.();

        // 3. Flush pending OTEL traces/metrics before exiting
        await shutdownOpenTelemetry(logger);

        // 4. Allow brief window for in-flight requests to complete, then exit
        setTimeout(() => {
          logger.info("Shutdown complete – exiting");
          process.exit(0);
        }, 5_000);
      };

      process.on("SIGTERM", () => handleHttpShutdown("SIGTERM"));
      process.on("SIGINT", () => handleHttpShutdown("SIGINT"));
    }
  } catch (error) {
    logger.error({ error }, "Failed to start server");
    process.exit(1);
  }
}
