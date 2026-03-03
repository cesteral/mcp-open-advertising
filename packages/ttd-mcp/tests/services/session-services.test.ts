import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createSessionServices,
  SessionServiceStore,
  type SessionServices,
} from "../../src/services/session-services.js";
import { TtdHttpClient } from "../../src/services/ttd/ttd-http-client.js";
import { TtdService } from "../../src/services/ttd/ttd-service.js";
import { TtdReportingService } from "../../src/services/ttd/ttd-reporting-service.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: "debug",
  } as any;
}

function createMockAuthAdapter(token = "token") {
  return {
    getAccessToken: vi.fn().mockResolvedValue(token),
    partnerId: "p1",
  };
}

function createMockRateLimiter() {
  return {
    consume: vi.fn().mockResolvedValue(undefined),
    configure: vi.fn(),
  } as any;
}

/** Create a stub SessionServices object for store tests. */
function stubSessionServices(): SessionServices {
  return {
    httpClient: {} as TtdHttpClient,
    ttdService: {} as TtdService,
    ttdReportingService: {} as TtdReportingService,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createSessionServices", () => {
  it("creates all 3 services (httpClient, ttdService, ttdReportingService)", () => {
    const logger = createMockLogger();
    const authAdapter = createMockAuthAdapter();
    const rateLimiter = createMockRateLimiter();

    const services = createSessionServices(
      authAdapter as any,
      "https://api.thetradedesk.com/v3",
      logger,
      rateLimiter,
    );

    expect(services.httpClient).toBeInstanceOf(TtdHttpClient);
    expect(services.ttdService).toBeInstanceOf(TtdService);
    expect(services.ttdReportingService).toBeInstanceOf(TtdReportingService);
  });

  it("returns an object with all services", () => {
    const logger = createMockLogger();
    const authAdapter = createMockAuthAdapter();
    const rateLimiter = createMockRateLimiter();

    const services = createSessionServices(
      authAdapter as any,
      "https://api.thetradedesk.com/v3",
      logger,
      rateLimiter,
    );

    expect(services).toHaveProperty("httpClient");
    expect(services).toHaveProperty("ttdService");
    expect(services).toHaveProperty("ttdReportingService");
    expect(Object.keys(services)).toHaveLength(3);
  });
});

describe("SessionServiceStore", () => {
  let store: SessionServiceStore;

  beforeEach(() => {
    store = new SessionServiceStore();
  });

  describe("set/get", () => {
    it("stores and retrieves services", () => {
      const services = stubSessionServices();

      store.set("session-1", services);

      expect(store.get("session-1")).toBe(services);
    });

    it("returns undefined for unknown session", () => {
      expect(store.get("nonexistent")).toBeUndefined();
    });
  });

  describe("delete", () => {
    it("removes services and fingerprint", () => {
      const services = stubSessionServices();
      store.set("session-1", services, "fp-abc");

      store.delete("session-1");

      expect(store.get("session-1")).toBeUndefined();
      // After deletion, fingerprint should be gone too (validate returns true for missing)
      expect(store.validateFingerprint("session-1", "fp-abc")).toBe(true);
    });
  });

  describe("size", () => {
    it("returns count of stored sessions", () => {
      expect(store.size).toBe(0);

      store.set("s1", stubSessionServices());
      expect(store.size).toBe(1);

      store.set("s2", stubSessionServices());
      expect(store.size).toBe(2);

      store.delete("s1");
      expect(store.size).toBe(1);
    });
  });

  describe("isFull", () => {
    it("returns true when maxSessions reached", () => {
      const smallStore = new SessionServiceStore(2);
      smallStore.set("s1", stubSessionServices());
      smallStore.set("s2", stubSessionServices());

      expect(smallStore.isFull()).toBe(true);
    });

    it("returns false when under limit", () => {
      const smallStore = new SessionServiceStore(5);
      smallStore.set("s1", stubSessionServices());

      expect(smallStore.isFull()).toBe(false);
    });
  });

  describe("validateFingerprint", () => {
    it("returns true when no stored fingerprint", () => {
      store.set("s1", stubSessionServices());

      // No fingerprint was stored for this session
      expect(store.validateFingerprint("s1", "any-fingerprint")).toBe(true);
    });

    it("returns true when fingerprint matches", () => {
      store.set("s1", stubSessionServices(), "fp-match");

      expect(store.validateFingerprint("s1", "fp-match")).toBe(true);
    });

    it("returns false when fingerprint mismatches", () => {
      store.set("s1", stubSessionServices(), "fp-original");

      expect(store.validateFingerprint("s1", "fp-different")).toBe(false);
    });
  });
});
