/**
 * Per-Session Service Factory & Store for DBM-MCP
 *
 * Each SSE session gets its own BidManagerService instance backed by the
 * user-provided GoogleAuthAdapter. Services are created when the session
 * starts and cleaned up when it closes or times out.
 */

import { google } from "googleapis";
import type { Logger } from "pino";
import type { GoogleAuthAdapter } from "@bidshifter/shared";
import { BidManagerService } from "./bid-manager/BidManagerService.js";
import { createGoogleAuthFromAdapter } from "./bid-manager/auth-bridge.js";
import type { AppConfig } from "../config/index.js";

/**
 * All services scoped to a single session.
 */
export interface SessionServices {
  bidManagerService: BidManagerService;
}

/**
 * Create session-scoped services for a single authenticated session.
 */
export function createSessionServices(
  authAdapter: GoogleAuthAdapter,
  config: AppConfig,
  logger: Logger,
): SessionServices {
  // Bridge GoogleAuthAdapter → googleapis OAuth2Client
  const googleAuth = createGoogleAuthFromAdapter(authAdapter);

  // Create Bid Manager API client (v2) using the bridged auth
  const bidManagerClient = google.doubleclickbidmanager({
    version: "v2",
    auth: googleAuth,
  });

  // Create BidManagerService with the pre-initialized client
  const bidManagerService = new BidManagerService(config, logger, bidManagerClient);

  return { bidManagerService };
}

/**
 * Default maximum number of concurrent sessions.
 */
const DEFAULT_MAX_SESSIONS = 1000;

/**
 * Store for session-scoped services with security hardening:
 * - Max session cap to prevent resource exhaustion
 * - Credential fingerprint binding to prevent session hijacking
 */
export class SessionServiceStore {
  private store = new Map<string, SessionServices>();
  private fingerprints = new Map<string, string>();
  private readonly maxSessions: number;

  constructor(maxSessions: number = DEFAULT_MAX_SESSIONS) {
    this.maxSessions = maxSessions;
  }

  /**
   * Returns true if the store is at capacity.
   */
  isFull(): boolean {
    return this.store.size >= this.maxSessions;
  }

  set(sessionId: string, services: SessionServices, credentialFingerprint?: string): void {
    this.store.set(sessionId, services);
    if (credentialFingerprint) {
      this.fingerprints.set(sessionId, credentialFingerprint);
    }
  }

  get(sessionId: string): SessionServices | undefined {
    return this.store.get(sessionId);
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
  }

  get size(): number {
    return this.store.size;
  }
}

export const sessionServiceStore = new SessionServiceStore();
