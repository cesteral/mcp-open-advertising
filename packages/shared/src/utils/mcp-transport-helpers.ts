/**
 * MCP Transport Helpers
 *
 * Pure logic functions extracted from the 3 nearly-identical transport files.
 * These helpers are framework-agnostic (no Hono dependency) so they can live
 * in @cesteral/shared while each server keeps its Hono wiring.
 */

import { randomBytes } from "crypto";
import type { Logger } from "pino";

// ---------------------------------------------------------------------------
// Session ID validation
// ---------------------------------------------------------------------------

const SESSION_ID_PATTERN = /^[a-f0-9-]{20,100}$/i;

export function isValidSessionId(id: string): boolean {
  return SESSION_ID_PATTERN.test(id);
}

export function generateSessionId(): string {
  return randomBytes(32).toString("hex");
}

// ---------------------------------------------------------------------------
// MCP Protocol version validation
// ---------------------------------------------------------------------------

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-03-26", "2025-06-18", "2025-11-25"] as const;

export function validateProtocolVersion(version: string): boolean {
  return (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(version);
}

// ---------------------------------------------------------------------------
// CORS origin resolution
// ---------------------------------------------------------------------------

export function buildAllowedOrigins(
  allowedOriginsConfig: string | undefined,
  nodeEnv: string,
  logger: Logger
): string | string[] {
  if (allowedOriginsConfig) {
    const origins = allowedOriginsConfig
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    logger.info({ origins }, "CORS configured with explicit origins");
    return origins;
  }
  if (nodeEnv === "production") {
    logger.warn(
      "No MCP_ALLOWED_ORIGINS configured in production — CORS will reject all cross-origin requests. " +
        "Set MCP_ALLOWED_ORIGINS to a comma-separated list of allowed origins."
    );
    return [];
  }
  return "*";
}

// ---------------------------------------------------------------------------
// Headers extraction
// ---------------------------------------------------------------------------

export function extractHeadersMap(rawHeaders: Headers): Record<string, string> {
  return Object.fromEntries([...rawHeaders.entries()].map(([k, v]) => [k, v]));
}

// ---------------------------------------------------------------------------
// RFC 9728 OAuth Protected Resource Metadata
// ---------------------------------------------------------------------------

export function oauthProtectedResourceBody(
  authMode: string,
  requestUrl: string
): { body: Record<string, unknown>; status: number } {
  if (authMode === "jwt") {
    return {
      body: {
        resource: requestUrl.replace("/.well-known/oauth-protected-resource", ""),
        bearer_methods_supported: ["header"],
        scopes_supported: [],
      },
      status: 200,
    };
  }
  return {
    body: { error: "OAuth not configured on this server" },
    status: 404,
  };
}

// ---------------------------------------------------------------------------
// Session Manager
// ---------------------------------------------------------------------------

/**
 * Minimal interface that SessionServiceStore must satisfy for the
 * SessionManager to clean up session services on timeout/shutdown.
 */
export interface SessionServiceStoreLike {
  delete(sessionId: string): void;
  readonly size: number;
}

/**
 * Manages MCP server instances and session lifecycle:
 * - Tracks session creation timestamps for timeout sweeps
 * - Caches MCP server instances per session
 * - Provides cleanup, sweep, and shutdown helpers
 */
export class SessionManager<TMcpServer extends { close(): Promise<void> }> {
  readonly sessionCreatedAt = new Map<string, number>();
  readonly sessionServers = new Map<string, TMcpServer>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly sessionServiceStore: SessionServiceStoreLike) {}

  trackSession(sessionId: string): void {
    this.sessionCreatedAt.set(sessionId, Date.now());
  }

  getServer(sessionId: string): TMcpServer | undefined {
    return this.sessionServers.get(sessionId);
  }

  setServer(sessionId: string, server: TMcpServer): void {
    this.sessionServers.set(sessionId, server);
  }

  async cleanupSession(sessionId: string): Promise<void> {
    const cachedServer = this.sessionServers.get(sessionId);
    if (cachedServer) {
      await cachedServer.close().catch(() => {});
      this.sessionServers.delete(sessionId);
    }
    this.sessionServiceStore.delete(sessionId);
    this.sessionCreatedAt.delete(sessionId);
  }

  startSweep(timeoutMs: number, logger: Logger): void {
    this.sweepTimer = setInterval(() => {
      const now = Date.now();
      for (const [sessionId, createdAt] of this.sessionCreatedAt) {
        if (now - createdAt > timeoutMs) {
          logger.info(
            { sessionId, ageMs: now - createdAt },
            "Session timed out — cleaning up"
          );
          this.cleanupSession(sessionId).catch(() => {});
        }
      }
    }, 60_000);
    this.sweepTimer.unref();
  }

  async shutdown(): Promise<void> {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    for (const [, cachedServer] of this.sessionServers) {
      await cachedServer.close().catch(() => {});
    }
    this.sessionServers.clear();
    this.sessionCreatedAt.clear();
  }
}
