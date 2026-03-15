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

import type { SessionAuthContext } from "../auth/auth-strategy.js";

const DEFAULT_MAX_SESSIONS = 1000;

export class SessionServiceStore<T> {
  private store = new Map<string, T>();
  private fingerprints = new Map<string, string>();
  private authContexts = new Map<string, SessionAuthContext>();
  private readonly maxSessions: number;

  constructor(maxSessions: number = DEFAULT_MAX_SESSIONS) {
    this.maxSessions = maxSessions;
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
    return stored === credentialFingerprint;
  }

  delete(sessionId: string): void {
    this.store.delete(sessionId);
    this.fingerprints.delete(sessionId);
    this.authContexts.delete(sessionId);
  }

  get size(): number {
    return this.store.size;
  }
}