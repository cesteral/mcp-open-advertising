// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Stdio serving for every MCP server (#243).
 *
 * `serveStdio` owns the era decision for the connection: the opening exchange
 * (`server/discover` for 2026-07-28, `initialize` for 2025) selects the era,
 * one server instance from the factory is pinned for the connection, and
 * everything after passes straight through to it. A hand-wired
 * `McpServer.connect(new StdioServerTransport())` serves only the 2025 era.
 *
 * The factory can run more than once per connection (a `server/discover` probe
 * instance is discarded if the client falls back to `initialize`), so it must
 * be cheap and side-effect free beyond building a server. The stdio session's
 * env-credential services are set up once, before this, in the session store
 * under the fixed `"stdio"` session id; each instance resolves them from there.
 */

import { serveStdio, type ServeStdioOptions } from "@modelcontextprotocol/server/stdio";
import type { McpServer } from "@modelcontextprotocol/server";
import type { Logger } from "pino";

/** The fixed session id of a stdio connection (one process, one client). */
export const STDIO_SESSION_ID = "stdio";

export interface StdioServerHandle {
  /** Closes the pinned instance (if any) and the underlying stdio transport. */
  close(): Promise<void>;
}

/**
 * Serve one server over stdio, negotiating the protocol era per connection.
 *
 * @param createServer builds a fresh server for `sessionId` (called once per
 *   server instance the connection needs)
 */
export function serveStdioServer(
  createServer: (sessionId: string) => Promise<McpServer>,
  logger: Logger,
  /** Test seam: serve over this transport instead of the process's stdio. */
  options: Pick<ServeStdioOptions, "transport"> = {}
): StdioServerHandle {
  logger.info("Starting MCP server with stdio transport");
  const handle = serveStdio(
    (ctx) => {
      logger.debug({ era: ctx.era }, "Building MCP server instance for stdio connection");
      return createServer(STDIO_SESSION_ID);
    },
    {
      ...options,
      onerror: (err) => logger.error({ err }, "stdio transport error"),
    }
  );
  logger.info("MCP server serving via stdio");
  return handle;
}
