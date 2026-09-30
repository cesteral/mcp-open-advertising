import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isValidSessionId,
  generateSessionId,
  validateProtocolVersion,
  SUPPORTED_PROTOCOL_VERSIONS,
  buildAllowedOrigins,
  createDnsRebindingPolicy,
  isLoopbackBindHost,
  parseAllowedHosts,
  extractHeadersMap,
  oauthProtectedResourceBody,
  parseAuthorizationServers,
  wwwAuthenticateChallenge,
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

describe("DNS-rebinding policy (#241)", () => {
  describe("isLoopbackBindHost", () => {
    it.each(["127.0.0.1", "localhost", "::1", "[::1]", "127.0.0.2", "LOCALHOST"])(
      "treats %s as loopback",
      (h) => expect(isLoopbackBindHost(h)).toBe(true)
    );
    it.each(["0.0.0.0", "::", "10.0.0.5", "mcp.example.com", "127.evil.com"])(
      "treats %s as non-loopback",
      (h) => expect(isLoopbackBindHost(h)).toBe(false)
    );
  });

  describe("parseAllowedHosts", () => {
    it("is undefined when unset or blank, so an empty value cannot reject everything", () => {
      expect(parseAllowedHosts(undefined)).toBeUndefined();
      expect(parseAllowedHosts("")).toBeUndefined();
      expect(parseAllowedHosts(" , ")).toBeUndefined();
    });
    it("trims and lower-cases entries", () => {
      expect(parseAllowedHosts(" MCP.Example.com , localhost:3001")).toEqual([
        "mcp.example.com",
        "localhost:3001",
      ]);
    });
  });

  describe("loopback bind, no allow-lists (self-host default)", () => {
    const policy = createDnsRebindingPolicy({
      bindHost: "127.0.0.1",
      allowedHosts: undefined,
      allowedOrigin: "*",
    });

    it("is in loopback mode", () => expect(policy.mode).toBe("loopback"));

    it.each(["localhost:3001", "127.0.0.1:3001", "[::1]:3001", "localhost", "LocalHost:3001"])(
      "accepts Host %s",
      (host) => expect(policy.check({ host })).toBeNull()
    );

    it.each([
      "evil.example.com",
      "evil.example.com:3001",
      "evil.example.com@localhost",
      "localhost.evil.example.com",
      "localhost/evil",
      "",
    ])("rejects Host %j", (host) => expect(policy.check({ host })).toBe("host"));

    it("rejects a missing Host", () => {
      expect(policy.check({})).toBe("host");
    });

    it("accepts a loopback Origin and no Origin", () => {
      expect(policy.check({ host: "localhost:3001", origin: "http://localhost:3001" })).toBeNull();
      expect(policy.check({ host: "localhost:3001", origin: "http://127.0.0.1:5173" })).toBeNull();
      expect(policy.check({ host: "localhost:3001" })).toBeNull();
    });

    it("rejects a rebinding Origin even when Host looks local", () => {
      expect(policy.check({ host: "localhost:3001", origin: "http://evil.example.com" })).toBe(
        "origin"
      );
      expect(policy.check({ host: "localhost:3001", origin: "null" })).toBe("origin");
      expect(policy.check({ host: "localhost:3001", origin: "file://localhost" })).toBe("origin");
    });

    it("rejects the conformance rebinding request (Host and Origin evil.example.com)", () => {
      expect(
        policy.check({ host: "evil.example.com", origin: "http://evil.example.com" })
      ).not.toBeNull();
    });
  });

  describe("MCP_ALLOWED_HOSTS set", () => {
    const policy = createDnsRebindingPolicy({
      bindHost: "0.0.0.0",
      allowedHosts: parseAllowedHosts("mcp.example.com,internal.example.com:8443"),
      allowedOrigin: "*",
    });

    it("is in allowed-hosts mode even on a non-loopback bind", () => {
      expect(policy.mode).toBe("allowed-hosts");
    });

    it("accepts a listed hostname on any port, and an exact host:port entry", () => {
      expect(policy.check({ host: "mcp.example.com" })).toBeNull();
      expect(policy.check({ host: "MCP.example.com:443" })).toBeNull();
      expect(policy.check({ host: "internal.example.com:8443" })).toBeNull();
    });

    it("rejects unlisted hosts, a listed host on the wrong port, and loopback not listed", () => {
      expect(policy.check({ host: "evil.example.com" })).toBe("host");
      expect(policy.check({ host: "internal.example.com:9000" })).toBe("host");
      expect(policy.check({ host: "localhost:3001" })).toBe("host");
      expect(policy.check({})).toBe("host");
    });

    it("replaces the loopback default on a loopback bind", () => {
      const p = createDnsRebindingPolicy({
        bindHost: "127.0.0.1",
        allowedHosts: parseAllowedHosts("dev.local"),
        allowedOrigin: "*",
      });
      expect(p.check({ host: "dev.local:3001" })).toBeNull();
      expect(p.check({ host: "localhost:3001" })).toBe("host");
    });
  });

  describe("non-loopback bind, no MCP_ALLOWED_HOSTS (hosted default)", () => {
    it("does not check Host, and keeps the Origin rules as before", () => {
      const dev = createDnsRebindingPolicy({
        bindHost: "0.0.0.0",
        allowedHosts: undefined,
        allowedOrigin: "*",
      });
      expect(dev.mode).toBe("off");
      expect(dev.check({ host: "svc-abc-ew.a.run.app" })).toBeNull();
      expect(dev.check({ host: "anything", origin: "http://evil.example.com" })).toBeNull();

      // NODE_ENV=production with no MCP_ALLOWED_ORIGINS: buildAllowedOrigins → []
      const prod = createDnsRebindingPolicy({
        bindHost: "0.0.0.0",
        allowedHosts: undefined,
        allowedOrigin: [],
      });
      expect(prod.check({ host: "svc-abc-ew.a.run.app" })).toBeNull();
      expect(prod.check({ host: "svc", origin: "https://app.example.com" })).toBe("origin");

      const listed = createDnsRebindingPolicy({
        bindHost: "0.0.0.0",
        allowedHosts: undefined,
        allowedOrigin: ["https://app.example.com"],
      });
      expect(listed.check({ host: "svc", origin: "https://app.example.com" })).toBeNull();
      expect(listed.check({ host: "svc", origin: "https://evil.example.com" })).toBe("origin");
    });
  });

  it("an explicit MCP_ALLOWED_ORIGINS on a loopback bind replaces the loopback-origin rule", () => {
    const p = createDnsRebindingPolicy({
      bindHost: "127.0.0.1",
      allowedHosts: undefined,
      allowedOrigin: ["https://app.example.com"],
    });
    expect(p.check({ host: "localhost:3001", origin: "https://app.example.com" })).toBeNull();
    expect(p.check({ host: "localhost:3001", origin: "http://localhost:3001" })).toBe("origin");
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

  describe("authorization_servers (#246)", () => {
    const saved = process.env.MCP_AUTHORIZATION_SERVERS;
    afterEach(() => {
      if (saved === undefined) delete process.env.MCP_AUTHORIZATION_SERVERS;
      else process.env.MCP_AUTHORIZATION_SERVERS = saved;
    });

    it("omits the field rather than inventing one when unconfigured", () => {
      delete process.env.MCP_AUTHORIZATION_SERVERS;
      const { body } = oauthProtectedResourceBody("jwt", "https://example.com");
      expect(body).not.toHaveProperty("authorization_servers");
    });

    it("publishes configured issuers", () => {
      process.env.MCP_AUTHORIZATION_SERVERS =
        "https://auth.example.com, https://idp.example.org/tenant1";
      const { body } = oauthProtectedResourceBody("jwt", "https://example.com");
      expect(body.authorization_servers).toEqual([
        "https://auth.example.com",
        "https://idp.example.org/tenant1",
      ]);
    });
  });
});

describe("parseAuthorizationServers", () => {
  it("keeps https issuers and localhost http, drops everything else", () => {
    expect(
      parseAuthorizationServers(
        "https://a.example, http://evil.example, not a url, http://localhost:9000, , javascript:alert(1)"
      )
    ).toEqual(["https://a.example", "http://localhost:9000"]);
  });

  it("returns [] for unset", () => {
    expect(parseAuthorizationServers(undefined)).toEqual([]);
  });
});

describe("wwwAuthenticateChallenge", () => {
  const saved = process.env.MCP_RESOURCE_URI;
  afterEach(() => {
    if (saved === undefined) delete process.env.MCP_RESOURCE_URI;
    else process.env.MCP_RESOURCE_URI = saved;
  });

  it("derives resource_metadata from an absolute MCP_RESOURCE_URI", () => {
    process.env.MCP_RESOURCE_URI = "https://mcp.example.com/dv360";
    expect(wwwAuthenticateChallenge("jwt", "http://10.0.0.1:8080/mcp")).toBe(
      'Bearer realm="mcp", resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"'
    );
  });

  it("falls back to the request origin when MCP_RESOURCE_URI is not a URL", () => {
    process.env.MCP_RESOURCE_URI = "cesteral-services";
    expect(wwwAuthenticateChallenge("jwt", "https://dv360.example.com/mcp")).toBe(
      'Bearer realm="mcp", resource_metadata="https://dv360.example.com/.well-known/oauth-protected-resource"'
    );
  });

  it("uses a plain Bearer challenge for platform bearer modes", () => {
    expect(wwwAuthenticateChallenge("tiktok-bearer", "https://x.example/mcp")).toBe(
      'Bearer realm="mcp"'
    );
  });

  it("has no challenge for custom-header modes", () => {
    expect(wwwAuthenticateChallenge("google-headers", "https://x.example/mcp")).toBeUndefined();
    expect(wwwAuthenticateChallenge("ttd-token", "https://x.example/mcp")).toBeUndefined();
    expect(wwwAuthenticateChallenge("none", "https://x.example/mcp")).toBeUndefined();
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
