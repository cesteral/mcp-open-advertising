import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isValidSessionId,
  generateSessionId,
  validateProtocolVersion,
  SUPPORTED_PROTOCOL_VERSIONS,
  buildAllowedOrigins,
  extractHeadersMap,
  oauthProtectedResourceBody,
  validateSessionReuse,
  SessionManager,
  type SessionServiceStoreLike,
} from "../../src/utils/mcp-transport-helpers.js";
import type { Logger } from "pino";
import type { AuthStrategy } from "../../src/auth/auth-strategy.js";
import { SessionServiceStore } from "../../src/utils/session-store.js";

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger;
}

describe("isValidSessionId", () => {
  it("accepts a server-minted 64-char hex id (the only shape generateSessionId produces)", () => {
    expect(isValidSessionId(generateSessionId())).toBe(true);
    expect(isValidSessionId("a".repeat(64))).toBe(true);
    expect(isValidSessionId("A1B2C3D4".repeat(8))).toBe(true); // case-insensitive
  });

  it("rejects too-short or too-long ids", () => {
    expect(isValidSessionId("abc")).toBe(false);
    expect(isValidSessionId("a".repeat(22))).toBe(false); // hex but wrong length
    expect(isValidSessionId("a".repeat(63))).toBe(false);
    expect(isValidSessionId("a".repeat(65))).toBe(false);
  });

  it("rejects ids with non-hex characters", () => {
    expect(isValidSessionId("g".repeat(64))).toBe(false);
  });

  it("rejects hyphenated / client-invented ids (server never mints these)", () => {
    // Regression for security review Finding 3: only the server-minted shape is
    // accepted, so arbitrary attacker-chosen identifiers can't enter the
    // session-create / rebuild path.
    expect(isValidSessionId("abcdef01-2345-6789-abcd-ef0123456789")).toBe(false);
  });
});

describe("generateSessionId", () => {
  it("should generate a 64-char hex string", () => {
    const id = generateSessionId();
    expect(id).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should generate unique IDs", () => {
    const id1 = generateSessionId();
    const id2 = generateSessionId();
    expect(id1).not.toBe(id2);
  });
});

describe("validateProtocolVersion", () => {
  it("should accept supported versions", () => {
    for (const v of SUPPORTED_PROTOCOL_VERSIONS) {
      expect(validateProtocolVersion(v)).toBe(true);
    }
  });

  it("should reject unsupported versions", () => {
    expect(validateProtocolVersion("2024-01-01")).toBe(false);
    expect(validateProtocolVersion("invalid")).toBe(false);
  });
});

describe("buildAllowedOrigins", () => {
  it("should parse comma-separated origins", () => {
    const logger = createMockLogger();
    const result = buildAllowedOrigins("http://a.com,http://b.com", "development", logger);
    expect(result).toEqual(["http://a.com", "http://b.com"]);
  });

  it("should return wildcard in development when no origins configured", () => {
    const logger = createMockLogger();
    expect(buildAllowedOrigins(undefined, "development", logger)).toBe("*");
  });

  it("should return empty array in production when no origins configured", () => {
    const logger = createMockLogger();
    expect(buildAllowedOrigins(undefined, "production", logger)).toEqual([]);
  });
});

describe("extractHeadersMap", () => {
  it("should convert Headers to Record", () => {
    const headers = new Headers({ "content-type": "application/json", "x-custom": "value" });
    const result = extractHeadersMap(headers);
    expect(result["content-type"]).toBe("application/json");
    expect(result["x-custom"]).toBe("value");
  });
});

describe("oauthProtectedResourceBody", () => {
  it("should return metadata for jwt mode", () => {
    const result = oauthProtectedResourceBody(
      "jwt",
      "https://example.com/.well-known/oauth-protected-resource"
    );
    expect(result.status).toBe(200);
    expect(result.body.resource).toBe("https://example.com");
  });

  it("should return 404 for non-jwt modes", () => {
    const result = oauthProtectedResourceBody("google-headers", "https://example.com");
    expect(result.status).toBe(404);
  });
});

interface MockServices {
  svc: string;
}

function createMockAuthStrategy(options: {
  extractorFingerprint?: string;
  verifyFingerprint?: string;
  throwOnExtract?: boolean;
  throwOnVerify?: boolean;
}): AuthStrategy {
  return {
    getCredentialFingerprint: vi.fn().mockImplementation(async () => {
      if (options.throwOnExtract) throw new Error("extract failed");
      return options.extractorFingerprint;
    }),
    verify: vi.fn().mockImplementation(async () => {
      if (options.throwOnVerify) throw new Error("verify failed");
      return {
        authInfo: { clientId: "user@test.com", authType: "jwt" },
        credentialFingerprint: options.verifyFingerprint,
      };
    }),
  };
}

describe("validateSessionReuse", () => {
  it("should return valid when extractor fingerprint matches", async () => {
    const store = new SessionServiceStore<MockServices>();
    store.set("s1", { svc: "a" }, "fp-abc");
    const strategy = createMockAuthStrategy({ extractorFingerprint: "fp-abc" });

    const result = await validateSessionReuse(strategy, store, {}, "s1");
    expect(result.valid).toBe(true);
    expect(result.requestFingerprint).toBe("fp-abc");
    expect(strategy.verify).not.toHaveBeenCalled();
  });

  it("should return invalid when extractor fingerprint mismatches", async () => {
    const store = new SessionServiceStore<MockServices>();
    store.set("s1", { svc: "a" }, "fp-abc");
    const strategy = createMockAuthStrategy({ extractorFingerprint: "fp-xyz" });

    const result = await validateSessionReuse(strategy, store, {}, "s1");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("fingerprint");
    expect(result.storedFingerprint).toBe("fp-abc");
    expect(result.requestFingerprint).toBe("fp-xyz");
  });

  it("should fallback to verify when extractor returns undefined", async () => {
    const store = new SessionServiceStore<MockServices>();
    store.set("s1", { svc: "a" }, "fp-abc");
    const strategy = createMockAuthStrategy({ verifyFingerprint: "fp-abc" });

    const result = await validateSessionReuse(strategy, store, {}, "s1");
    expect(result.valid).toBe(true);
    expect(result.authResult?.authInfo.clientId).toBe("user@test.com");
    expect(strategy.verify).toHaveBeenCalled();
  });

  it("rejects a live session that has services but no stored fingerprint when the caller is credentialed", async () => {
    // Regression for security review Finding 2: a session created without a
    // credential fingerprint must not be reusable by a caller that DOES present
    // fingerprintable credentials, or any credentialed caller could ride it.
    const store = new SessionServiceStore<MockServices>();
    store.set("s1", { svc: "a" }); // services stored WITHOUT a fingerprint
    const strategy = createMockAuthStrategy({ extractorFingerprint: "fp-any" });

    const result = await validateSessionReuse(strategy, store, {}, "s1");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("not credential-bound");
  });

  it("allows a session with no fingerprint when the caller is also uncredentialed (none mode)", async () => {
    const store = new SessionServiceStore<MockServices>();
    store.set("s1", { svc: "a" }); // no fingerprint
    const strategy = createMockAuthStrategy({}); // extractor + verify yield undefined

    const result = await validateSessionReuse(strategy, store, {}, "s1");
    expect(result.valid).toBe(true);
    expect(result.requestFingerprint).toBeUndefined();
  });

  it("allows rebuild when the session is not yet in the store (cold instance)", async () => {
    const store = new SessionServiceStore<MockServices>();
    // No store.set — session absent, as on a scaled-out instance before rehydration.
    const strategy = createMockAuthStrategy({ extractorFingerprint: "fp-any" });

    const result = await validateSessionReuse(strategy, store, {}, "s1");
    expect(result.valid).toBe(true);
    expect(result.requestFingerprint).toBe("fp-any");
  });

  it("should return invalid when extractor throws", async () => {
    const store = new SessionServiceStore<MockServices>();
    store.set("s1", { svc: "a" }, "fp-abc");
    const strategy = createMockAuthStrategy({ throwOnExtract: true });

    const result = await validateSessionReuse(strategy, store, {}, "s1");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Authentication failed");
  });
});

describe("SessionManager", () => {
  let store: SessionServiceStoreLike;
  let logger: Logger;

  beforeEach(() => {
    store = {
      delete: vi.fn(),
      size: 0,
    };
    logger = createMockLogger();
  });

  it("should track and retrieve sessions", () => {
    const manager = new SessionManager<{ close: () => Promise<void> }>(store);
    const mockServer = { close: vi.fn().mockResolvedValue(undefined) };

    manager.trackSession("s1");
    manager.setServer("s1", mockServer);

    expect(manager.getServer("s1")).toBe(mockServer);
    expect(manager.sessionCreatedAt.has("s1")).toBe(true);
  });

  it("should cleanup session", async () => {
    const manager = new SessionManager<{ close: () => Promise<void> }>(store);
    const mockServer = { close: vi.fn().mockResolvedValue(undefined) };

    manager.trackSession("s1");
    manager.setServer("s1", mockServer);

    await manager.cleanupSession("s1");

    expect(mockServer.close).toHaveBeenCalled();
    expect(manager.getServer("s1")).toBeUndefined();
    expect(store.delete).toHaveBeenCalledWith("s1");
  });

  it("should call onBeforeCleanup hook before deleting session", async () => {
    const onBeforeCleanup = vi.fn().mockResolvedValue(undefined);
    const manager = new SessionManager<{ close: () => Promise<void> }>(store, {
      onBeforeCleanup,
    });
    const mockServer = { close: vi.fn().mockResolvedValue(undefined) };

    manager.trackSession("s1");
    manager.setServer("s1", mockServer);

    await manager.cleanupSession("s1");

    expect(onBeforeCleanup).toHaveBeenCalledWith("s1");
  });

  it("logs a warning (and does not throw) when onBeforeCleanup fails", async () => {
    const onBeforeCleanup = vi.fn().mockRejectedValue(new Error("spill bucket unreachable"));
    const manager = new SessionManager<{ close: () => Promise<void> }>(store, {
      onBeforeCleanup,
      logger,
    });
    manager.trackSession("s1");

    await expect(manager.cleanupSession("s1")).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    // The session is still fully torn down despite the hook failure.
    expect(store.delete).toHaveBeenCalledWith("s1");
  });

  it("logs a warning (and does not throw) when server.close fails", async () => {
    const manager = new SessionManager<{ close: () => Promise<void> }>(store, { logger });
    const mockServer = { close: vi.fn().mockRejectedValue(new Error("socket already gone")) };
    manager.trackSession("s1");
    manager.setServer("s1", mockServer);

    await expect(manager.cleanupSession("s1")).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(manager.getServer("s1")).toBeUndefined();
  });

  it("stays silent (no logger) and still does not throw when cleanup fails", async () => {
    const onBeforeCleanup = vi.fn().mockRejectedValue(new Error("boom"));
    const manager = new SessionManager<{ close: () => Promise<void> }>(store, { onBeforeCleanup });
    manager.trackSession("s1");

    await expect(manager.cleanupSession("s1")).resolves.toBeUndefined();
    expect(store.delete).toHaveBeenCalledWith("s1");
  });

  it("should shutdown all sessions", async () => {
    const manager = new SessionManager<{ close: () => Promise<void> }>(store);
    const server1 = { close: vi.fn().mockResolvedValue(undefined) };
    const server2 = { close: vi.fn().mockResolvedValue(undefined) };

    manager.setServer("s1", server1);
    manager.setServer("s2", server2);

    await manager.shutdown();

    expect(server1.close).toHaveBeenCalled();
    expect(server2.close).toHaveBeenCalled();
    expect(manager.sessionServers.size).toBe(0);
  });

  it("should flush hooks for all tracked sessions during shutdown", async () => {
    const onBeforeCleanup = vi.fn().mockResolvedValue(undefined);
    const manager = new SessionManager<{ close: () => Promise<void> }>(store, {
      onBeforeCleanup,
    });
    const server1 = { close: vi.fn().mockResolvedValue(undefined) };
    const server2 = { close: vi.fn().mockResolvedValue(undefined) };

    manager.trackSession("s1");
    manager.trackSession("s2");
    manager.setServer("s1", server1);
    manager.setServer("s2", server2);

    await manager.shutdown();

    expect(onBeforeCleanup).toHaveBeenCalledWith("s1");
    expect(onBeforeCleanup).toHaveBeenCalledWith("s2");
  });
});
