import type { Logger } from "pino";
import type { TtdAuthAdapter } from "../auth/ttd-auth-adapter.js";
import type { RateLimiter } from "../utils/security/rate-limiter.js";
import { TtdHttpClient } from "./ttd/ttd-http-client.js";
import { TtdService } from "./ttd/ttd-service.js";
import { TtdReportingService } from "./ttd/ttd-reporting-service.js";

export interface SessionServices {
  httpClient: TtdHttpClient;
  ttdService: TtdService;
  ttdReportingService: TtdReportingService;
}

export function createSessionServices(
  authAdapter: TtdAuthAdapter,
  baseUrl: string,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const httpClient = new TtdHttpClient(authAdapter, baseUrl, logger);
  const ttdService = new TtdService(logger, rateLimiter, httpClient);
  const ttdReportingService = new TtdReportingService(logger, rateLimiter, httpClient);
  return { httpClient, ttdService, ttdReportingService };
}

const DEFAULT_MAX_SESSIONS = 1000;

export class SessionServiceStore {
  private store = new Map<string, SessionServices>();
  private fingerprints = new Map<string, string>();
  private readonly maxSessions: number;

  constructor(maxSessions: number = DEFAULT_MAX_SESSIONS) {
    this.maxSessions = maxSessions;
  }

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

  validateFingerprint(sessionId: string, credentialFingerprint: string): boolean {
    const stored = this.fingerprints.get(sessionId);
    if (!stored) return true;
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
