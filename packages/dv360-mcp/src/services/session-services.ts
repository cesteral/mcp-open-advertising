import type { Logger } from "pino";
import type { GoogleAuthAdapter } from "@bidshifter/shared";
import { RateLimiter } from "../utils/security/rate-limiter.js";
import { DV360HttpClient } from "./dv360/dv360-http-client.js";
import { DV360Service } from "./dv360/DV360-service.js";
import { TargetingService } from "./targeting/targeting-service.js";

export interface SessionServices {
  httpClient: DV360HttpClient;
  dv360Service: DV360Service;
  targetingService: TargetingService;
}

export function createSessionServices(
  authAdapter: GoogleAuthAdapter,
  baseUrl: string,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const httpClient = new DV360HttpClient(authAdapter, baseUrl, logger);
  const dv360Service = new DV360Service(logger, rateLimiter, httpClient);
  const targetingService = new TargetingService(logger, rateLimiter, httpClient);
  return { httpClient, dv360Service, targetingService };
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
