// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * MCP Transport Helpers
 *
 * Pure logic functions extracted from the 3 nearly-identical transport files.
 * These helpers are framework-agnostic (no Hono dependency) so they can live
 * in @cesteral/shared while each server keeps its Hono wiring.
 */

import { randomBytes } from "crypto";
import type { Logger } from "pino";
import type { AuthResult, AuthStrategy } from "../auth/auth-strategy.js";

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

/**
 * Extract a single header value from a headers record, handling case-insensitive
 * lookup and array values. Shared across all platform auth adapters.
 */
export function extractHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

// ---------------------------------------------------------------------------
// RFC 9728 OAuth Protected Resource Metadata
// ---------------------------------------------------------------------------

export function oauthProtectedResourceBody(
  authMode: string,
  requestUrl: string
): { body: Record<string, unknown>; status: number } {
  if (authMode === "jwt") {
    const resourceUri =
      process.env.MCP_RESOURCE_URI ||
      requestUrl.replace("/.well-known/oauth-protected-resource", "");

    const body: Record<string, unknown> = {
      resource: resourceUri,
      bearer_methods_supported: ["header"],
      scopes_supported: [],
    };

    if (process.env.MCP_RESOURCE_DOCS_URI) {
      body.resource_documentation = process.env.MCP_RESOURCE_DOCS_URI;
    }

    return { body, status: 200 };
  }
  return {
    body: { error: "OAuth not configured on this server" },
    status: 404,
  };
}

// ---------------------------------------------------------------------------
// Session reuse validation
// ---------------------------------------------------------------------------

interface SessionFingerprintStore {
  validateFingerprint(sessionId: string, fingerprint: string): boolean;
  getFingerprint(sessionId: string): string | undefined;
}

export interface SessionReuseResult {
  valid: boolean;
  reason?: string;
  authResult?: AuthResult;
  storedFingerprint?: string;
  requestFingerprint?: string;
}

/**
 * Validate that a reused session belongs to the same credential holder.
 * Prefers lightweight fingerprint extraction to avoid expensive network auth calls.
 */
export async function validateSessionReuse(
  authStrategy: AuthStrategy,
  sessionServiceStore: SessionFingerprintStore,
  headers: Record<string, string>,
  sessionId: string
): Promise<SessionReuseResult> {
  let authResult: AuthResult | undefined;
  let requestFingerprint: string | undefined;

  try {
    if (authStrategy.getCredentialFingerprint) {
      requestFingerprint = await authStrategy.getCredentialFingerprint(headers);
    }
  } catch (error: any) {
    return {
      valid: false,
      reason: `Authentication failed on session reuse: ${error?.message ?? "unknown error"}`,
    };
  }

  if (!requestFingerprint) {
    try {
      authResult = await authStrategy.verify(headers);
      requestFingerprint = authResult.credentialFingerprint;
    } catch (error: any) {
      return {
        valid: false,
        reason: `Authentication failed on session reuse: ${error?.message ?? "unknown error"}`,
      };
    }
  }

  if (
    requestFingerprint &&
    !sessionServiceStore.validateFingerprint(sessionId, requestFingerprint)
  ) {
    const storedFingerprint = sessionServiceStore.getFingerprint(sessionId);
    return {
      valid: false,
      reason: "Credential fingerprint mismatch — possible session hijacking attempt",
      storedFingerprint,
      requestFingerprint,
    };
  }

  return {
    valid: true,
    authResult,
    requestFingerprint,
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

interface SessionManagerOptions {
  onBeforeCleanup?: (sessionId: string) => Promise<void>;
}

/**
 * Manages MCP server instances and session lifecycle:
 * - Tracks session creation timestamps for timeout sweeps
 * - Caches MCP server instances per session
 * - Provides cleanup, sweep, and shutdown helpers
 */
export class SessionManager<TMcpServer extends { close(): Promise<void> }> {
  readonly sessionCreatedAt = new Map<string, number>();
  readonly sessionLastActivity = new Map<string, number>();
  readonly sessionServers = new Map<string, TMcpServer>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly sessionServiceStore: SessionServiceStoreLike,
    private readonly options?: SessionManagerOptions
  ) {}

  trackSession(sessionId: string): void {
    const now = Date.now();
    this.sessionCreatedAt.set(sessionId, now);
    this.sessionLastActivity.set(sessionId, now);
  }

  /**
   * Update the last-activity timestamp for a session.
   * Call this on every inbound request to extend the idle timeout.
   */
  touchSession(sessionId: string): void {
    if (this.sessionCreatedAt.has(sessionId)) {
      this.sessionLastActivity.set(sessionId, Date.now());
    }
  }

  getServer(sessionId: string): TMcpServer | undefined {
    return this.sessionServers.get(sessionId);
  }

  setServer(sessionId: string, server: TMcpServer): void {
    this.sessionServers.set(sessionId, server);
  }

  async cleanupSession(sessionId: string): Promise<void> {
    if (this.options?.onBeforeCleanup) {
      await this.options.onBeforeCleanup(sessionId).catch(() => {});
    }

    const cachedServer = this.sessionServers.get(sessionId);
    if (cachedServer) {
      await cachedServer.close().catch(() => {});
      this.sessionServers.delete(sessionId);
    }
    this.sessionServiceStore.delete(sessionId);
    this.sessionCreatedAt.delete(sessionId);
    this.sessionLastActivity.delete(sessionId);
  }

  startSweep(timeoutMs: number, logger: Logger): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = setInterval(() => {
      const now = Date.now();
      const sessionIds = Array.from(this.sessionCreatedAt.keys());
      for (const sessionId of sessionIds) {
        const lastActivity = this.sessionLastActivity.get(sessionId) ?? 0;
        const idleMs = now - lastActivity;
        if (idleMs > timeoutMs) {
          logger.info({ sessionId, idleMs }, "Session timed out (idle) — cleaning up");
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

    if (this.options?.onBeforeCleanup) {
      const sessionIds = new Set<string>([
        ...this.sessionCreatedAt.keys(),
        ...this.sessionServers.keys(),
      ]);
      for (const sessionId of sessionIds) {
        await this.options.onBeforeCleanup(sessionId).catch(() => {});
      }
    }

    for (const [, cachedServer] of this.sessionServers) {
      await cachedServer.close().catch(() => {});
    }
    this.sessionServers.clear();
    this.sessionCreatedAt.clear();
    this.sessionLastActivity.clear();
  }
}
