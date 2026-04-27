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
  it("should accept valid hex session IDs", () => {
    expect(isValidSessionId("a".repeat(64))).toBe(true);
    expect(isValidSessionId("abcdef0123456789abcdef")).toBe(true);
  });

  it("should reject too-short IDs", () => {
    expect(isValidSessionId("abc")).toBe(false);
  });

  it("should reject IDs with invalid characters", () => {
    expect(isValidSessionId("g".repeat(64))).toBe(false);
  });

  it("should accept IDs with hyphens", () => {
    expect(isValidSessionId("abcdef01-2345-6789-abcd-ef0123456789")).toBe(true);
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

  it("should return valid when no stored fingerprint (stdio mode)", async () => {
    const store = new SessionServiceStore<MockServices>();
    store.set("s1", { svc: "a" }); // no fingerprint
    const strategy = createMockAuthStrategy({ extractorFingerprint: "fp-any" });

    const result = await validateSessionReuse(strategy, store, {}, "s1");
    expect(result.valid).toBe(true);
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
