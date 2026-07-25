// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Generic Session Service Store
 *
 * Provides session lifecycle management with security hardening:
 * - Max session cap to prevent resource exhaustion
 * - Credential fingerprint binding to prevent session hijacking
 *
 * Each MCP server instantiates this with its own SessionServices type.
 */

import { timingSafeEqual } from "crypto";

import type { SessionAuthContext } from "../auth/auth-strategy.js";

const DEFAULT_MAX_SESSIONS = 1000;

/**
 * Constant-time string comparison. Fingerprints are hashes of credentials, so a
 * timing side channel here is low-risk, but the comparison guards session
 * binding — compare in constant time so a match/mismatch cannot be probed by
 * timing. A length difference means definitely-not-equal; fingerprint length is
 * a function of the auth mode (public), never of a secret, so short-circuiting
 * on it leaks nothing, and `timingSafeEqual` requires equal-length inputs.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Callback fired when a session is deleted (explicit delete, transport close,
 * or shutdown). Registered via `SessionServiceStore.onDelete(cb)`. Callbacks
 * run sequentially via Promise.allSettled so one failing hook does not
 * prevent others from running; no hook can throw back into delete().
 */
export type SessionDeleteHook = (sessionId: string) => void | Promise<void>;

export class SessionServiceStore<T> {
  private store = new Map<string, T>();
  private fingerprints = new Map<string, string>();
  private authContexts = new Map<string, SessionAuthContext>();
  private readonly maxSessions: number;
  private readonly deleteHooks: Set<SessionDeleteHook> = new Set();

  constructor(maxSessions: number = DEFAULT_MAX_SESSIONS) {
    this.maxSessions = maxSessions;
  }

  /**
   * Register a callback to run when a session is deleted. Returns an
   * unregister function. Hooks are invoked fire-and-forget from delete() —
   * synchronous or asynchronous, errors are swallowed so a bad hook cannot
   * disrupt session cleanup.
   */
  onDelete(hook: SessionDeleteHook): () => void {
    this.deleteHooks.add(hook);
    return () => this.deleteHooks.delete(hook);
  }

  isFull(): boolean {
    return this.store.size >= this.maxSessions;
  }

  set(sessionId: string, services: T, credentialFingerprint?: string): void {
    this.store.set(sessionId, services);
    if (credentialFingerprint) {
      this.fingerprints.set(sessionId, credentialFingerprint);
    }
  }

  get(sessionId: string): T | undefined {
    return this.store.get(sessionId);
  }

  setAuthContext(sessionId: string, authContext: SessionAuthContext): void {
    this.authContexts.set(sessionId, authContext);
  }

  getAuthContext(sessionId: string): SessionAuthContext | undefined {
    return this.authContexts.get(sessionId);
  }

  getFingerprint(sessionId: string): string | undefined {
    return this.fingerprints.get(sessionId);
  }

  /**
   * Validate that the credential fingerprint matches the one used at session creation.
   * Returns false if the session exists but the fingerprint doesn't match.
   */
  validateFingerprint(sessionId: string, credentialFingerprint: string): boolean {
    const stored = this.fingerprints.get(sessionId);
    if (!stored) return true; // No fingerprint stored (e.g. stdio mode) — allow
    return constantTimeEqual(stored, credentialFingerprint);
  }

  /**
   * Remove a session and fire its delete hooks.
   *
   * Hooks fire ONLY for a session this store actually held. They used to fire
   * unconditionally, which made a delete for an unknown id destructive: on a
   * scaled-out deployment the receiving instance holds almost no sessions, so
   * `deleteSpilledObjectsForSession` ran a GCS bulk delete of report CSVs under
   * an id the instance had never seen — driven by a caller who only needed to
   * know the id (session ids are exposed to browsers by design, via
   * `exposeHeaders: ["Mcp-Session-Id"]`). Sweep 2026-07-25, 02-F1.
   *
   * Consequence, accepted and documented: when a session's services live on
   * another instance, the DELETE that reaches THIS instance no longer sweeps its
   * spilled objects early. The 24-hour GCS lifecycle rule on the `report_spill`
   * bucket is the primary control (see CLAUDE.md); the hook has always been
   * belt-and-braces on top of it.
   */
  delete(sessionId: string): void {
    const wasHeld =
      this.store.has(sessionId) ||
      this.fingerprints.has(sessionId) ||
      this.authContexts.has(sessionId);

    this.store.delete(sessionId);
    this.fingerprints.delete(sessionId);
    this.authContexts.delete(sessionId);

    if (!wasHeld) return;

    // Fire hooks fire-and-forget. Swallow all errors — session cleanup must
    // never throw. Hook authors should handle their own error logging.
    for (const hook of this.deleteHooks) {
      try {
        const result = hook(sessionId);
        if (result instanceof Promise) {
          result.catch(() => {});
        }
      } catch {
        // Intentionally swallowed.
      }
    }
  }

  get size(): number {
    return this.store.size;
  }
}
