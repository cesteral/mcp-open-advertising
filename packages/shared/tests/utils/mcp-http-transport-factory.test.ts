// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Integration tests for the shared streamable-HTTP transport factory
 * (`createMcpHttpTransport`). The per-server transport tests mock
 * `createTransportEntrypoints` wholesale, so the factory's own auth + session
 * decisions were previously untested end-to-end. These drive the real Hono app
 * via `app.request()` and assert the security-critical branches:
 *
 *   - credential-fingerprint binding on session reuse (hijack rejection),
 *   - fail-closed reuse of an unbound live session (review Finding 2),
 *   - unknown session ids receive 404 without allocating services,
 *   - auth failure → 401, protocol/session-id validation, capacity, and the
 *     DELETE credential check.
 *
 * The security decisions all resolve before the MCP JSON-RPC machinery runs, so
 * a stub `createMcpServer` is sufficient; success-path cases assert the session
 * side effects (which happen before transport handling) rather than the final
 * body.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import pino from "pino";
import {
  createMcpHttpTransport,
  type TransportFactoryConfig,
  type TransportFactoryAppConfig,
} from "../../src/utils/transport/mcp-http-transport-factory.js";
import { SessionServiceStore } from "../../src/utils/transport/session-store.js";
import { registerToolScopes } from "../../src/auth/tool-scopes.js";
import type { AuthStrategy, AuthResult } from "../../src/auth/auth-strategy.js";

// 64 hex chars — matches the isValidSessionId pattern /^[a-f0-9-]{20,100}$/i.
const VICTIM_SID = "a1b2c3d4".repeat(8);
const NEW_SID = "f0e1d2c3".repeat(8);

const PROTO = "2025-06-18";

/**
 * Fake strategy: fingerprint is `fp-<x-fake-cred>`; absent cred → auth fails.
 * `x-fake-scope` (space-delimited) becomes `authInfo.scopes`, like a jwt `scope` claim.
 */
function fakeAuthStrategy(authType = "fake"): AuthStrategy {
  const fp = (headers: Record<string, string | string[] | undefined>) => {
    const v = headers["x-fake-cred"];
    const cred = Array.isArray(v) ? v[0] : v;
    return cred ? `fp-${cred}` : undefined;
  };
  return {
    async verify(headers): Promise<AuthResult> {
      const f = fp(headers);
      if (!f) throw new Error("no credentials");
      return {
        authInfo: {
          clientId: f.slice(3),
          authType,
          scopes: headers["x-fake-scope"] ? String(headers["x-fake-scope"]).split(" ") : [],
        },
        credentialFingerprint: f,
      };
    },
    async getCredentialFingerprint(headers) {
      return fp(headers);
    },
  };
}

interface Harness {
  app: { request: (path: string, init?: RequestInit) => Promise<Response> };
  store: SessionServiceStore<{ svc: string }>;
  createSessionForAuth: ReturnType<typeof vi.fn>;
  shutdown: () => Promise<void>;
}

function makeHarness(
  opts: {
    maxSessions?: number;
    authMode?: string;
    authType?: string;
    host?: string;
    nodeEnv?: string;
    mcpAllowedHosts?: string;
    mcpAllowedOrigins?: string;
  } = {}
): Harness {
  const logger = pino({ level: "silent" });
  const store = new SessionServiceStore<{ svc: string }>(opts.maxSessions ?? 1000);

  // Mimics a real consumer: build services and bind the fingerprint.
  const createSessionForAuth = vi.fn(async (authResult: AuthResult, sessionId: string) => {
    const services = { svc: authResult.authInfo.clientId };
    store.set(sessionId, services, authResult.credentialFingerprint);
    return { services };
  });

  const platformConfig: TransportFactoryConfig = {
    authStrategy: fakeAuthStrategy(opts.authType),
    corsAllowHeaders: ["Content-Type", "Mcp-Session-Id", "X-Fake-Cred", "X-Fake-Scope"],
    authErrorHint: "provide X-Fake-Cred",
    sessionServiceStore: store as unknown as TransportFactoryConfig["sessionServiceStore"],
    createSessionForAuth:
      createSessionForAuth as unknown as TransportFactoryConfig["createSessionForAuth"],
    createMcpServer: async () => ({
      // Answers every request with an empty result, like a server with no handlers.
      connect: async (transport) => {
        transport.onmessage = (message) => {
          const id = (message as { id?: number | string }).id;
          if (id !== undefined) void transport.send({ jsonrpc: "2.0", id, result: {} });
        };
      },
      close: async () => {},
    }),
    packageJsonPath: "nonexistent-package.json", // read fails → version "unknown" (harmless)
  };

  const config: TransportFactoryAppConfig = {
    serviceName: "test-mcp",
    nodeEnv: opts.nodeEnv ?? "test",
    port: 0,
    host: opts.host ?? "127.0.0.1",
    mcpAuthMode: opts.authMode ?? "fake",
    mcpStatefulSessionTimeoutMs: 60_000,
    mcpAllowedHosts: opts.mcpAllowedHosts,
    mcpAllowedOrigins: opts.mcpAllowedOrigins,
  };

  const { app, shutdown } = createMcpHttpTransport(config, logger, platformConfig);
  return { app: app as unknown as Harness["app"], store, createSessionForAuth, shutdown };
}

function post(app: Harness["app"], headers: Record<string, string>) {
  return app.request("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", "mcp-protocol-version": PROTO, ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
  });
}

describe("createMcpHttpTransport — auth & session binding", () => {
  let active: Harness | undefined;
  afterEach(async () => {
    await active?.shutdown();
    active = undefined;
  });

  it("rejects an unsupported MCP protocol version with 400", async () => {
    active = makeHarness();
    const res = await active.app.request("/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "mcp-protocol-version": "1999-01-01",
        "x-fake-cred": "alice",
      },
      body: "{}",
    });
    // A version no 2025 revision names is routed to the stateless handler, which
    // answers with a JSON-RPC error body (here -32600: the body is `{}`) after
    // authentication (#243). The -32022 case is in modern-stateless-transport.test.ts.
    expect(res.status).toBe(400);
    expect(typeof (await res.json()).error?.code).toBe("number");
  });

  it("rejects a malformed session id with 400", async () => {
    active = makeHarness();
    const res = await post(active.app, { "mcp-session-id": "not a valid id!" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/session id/i);
  });

  it("returns 401 with the auth hint for a new session without credentials", async () => {
    active = makeHarness();
    const res = await post(active.app, {});
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.hint).toBe("provide X-Fake-Cred");
    expect(active.createSessionForAuth).not.toHaveBeenCalled();
  });

  it("omits WWW-Authenticate on a 401 for a custom-header auth mode", async () => {
    active = makeHarness(); // "fake": credentials travel in X-Fake-Cred, not Bearer
    const res = await post(active.app, {});
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBeNull();
  });

  it("sends a Bearer challenge on a 401 for a platform bearer mode (#246)", async () => {
    active = makeHarness({ authMode: "meta-bearer" });
    const res = await post(active.app, {});
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe('Bearer realm="mcp"');
  });

  it("points a jwt-mode 401 at the protected resource metadata (#246)", async () => {
    active = makeHarness({ authMode: "jwt" });
    const res = await post(active.app, {});
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(
      'Bearer realm="mcp", resource_metadata="http://localhost/.well-known/oauth-protected-resource"'
    );
  });

  it("challenges on a credential-mismatch 401 too, not only on missing credentials", async () => {
    active = makeHarness({ authMode: "jwt" });
    active.store.set(VICTIM_SID, { svc: "victim" }, "fp-victim");
    const res = await post(active.app, { "mcp-session-id": VICTIM_SID, "x-fake-cred": "mallory" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/^Bearer realm="mcp"/);
  });

  it("creates a new session bound to the caller's fingerprint (server-generated id)", async () => {
    active = makeHarness();
    await post(active.app, { "x-fake-cred": "alice" });
    expect(active.createSessionForAuth).toHaveBeenCalledTimes(1);
    const [authResult, sessionId] = active.createSessionForAuth.mock.calls[0]!;
    expect(sessionId).toMatch(/^[a-f0-9]{64}$/); // cryptographically generated, not client-chosen
    expect((authResult as AuthResult).credentialFingerprint).toBe("fp-alice");
    expect(active.store.getFingerprint(sessionId as string)).toBe("fp-alice");
  });

  it("rejects reuse of a live session whose stored fingerprint differs (hijack)", async () => {
    active = makeHarness();
    // Victim's live session on this instance, bound to fp-victim.
    active.store.set(VICTIM_SID, { svc: "victim" }, "fp-victim");

    // Mallory presents the victim's session id but her own credentials.
    const res = await post(active.app, { "mcp-session-id": VICTIM_SID, "x-fake-cred": "mallory" });

    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/credential mismatch/i);
    expect(active.createSessionForAuth).not.toHaveBeenCalled();
    // Victim's binding is untouched — Mallory did not overwrite or ride it.
    expect(active.store.getFingerprint(VICTIM_SID)).toBe("fp-victim");
    expect(active.store.get(VICTIM_SID)).toEqual({ svc: "victim" });
  });

  it("fails closed on reuse of a live session that has services but no fingerprint (Finding 2)", async () => {
    active = makeHarness();
    // A live session created without credential binding (consumer bug / undefined fp).
    active.store.set(VICTIM_SID, { svc: "unbound" }); // no fingerprint

    const res = await post(active.app, { "mcp-session-id": VICTIM_SID, "x-fake-cred": "mallory" });

    expect(res.status).toBe(401);
    expect(active.createSessionForAuth).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown id without binding it to the caller", async () => {
    active = makeHarness();
    const res = await post(active.app, { "mcp-session-id": VICTIM_SID, "x-fake-cred": "mallory" });
    expect(res.status).toBe(404);
    expect(active.createSessionForAuth).not.toHaveBeenCalled();
    expect(active.store.get(VICTIM_SID)).toBeUndefined();
    expect(active.store.getFingerprint(VICTIM_SID)).toBeUndefined();
  });

  it("authenticates before reporting an unknown id", async () => {
    active = makeHarness();
    const res = await post(active.app, { "mcp-session-id": NEW_SID }); // unknown id, no creds
    expect(res.status).toBe(401);
    expect(active.createSessionForAuth).not.toHaveBeenCalled();
  });

  it("returns 503 for a new session when the store is at capacity", async () => {
    active = makeHarness({ maxSessions: 1 });
    active.store.set(NEW_SID, { svc: "a" }, "fp-a"); // fill to capacity
    const res = await post(active.app, { "x-fake-cred": "bob" }); // new session, no id
    expect(res.status).toBe(503);
    expect(active.createSessionForAuth).not.toHaveBeenCalled();
  });

  describe("DELETE /mcp session termination", () => {
    it("rejects termination when the credential fingerprint does not match", async () => {
      active = makeHarness();
      active.store.set(VICTIM_SID, { svc: "victim" }, "fp-victim");
      const res = await active.app.request("/mcp", {
        method: "DELETE",
        headers: { "mcp-session-id": VICTIM_SID, "x-fake-cred": "mallory" },
      });
      expect(res.status).toBe(401);
      expect(active.store.get(VICTIM_SID)).toEqual({ svc: "victim" }); // not terminated
    });

    it("terminates the session when the fingerprint matches", async () => {
      active = makeHarness();
      active.store.set(VICTIM_SID, { svc: "victim" }, "fp-victim");
      const res = await active.app.request("/mcp", {
        method: "DELETE",
        headers: { "mcp-session-id": VICTIM_SID, "x-fake-cred": "victim" },
      });
      expect(res.status).toBe(200);
      expect(active.store.get(VICTIM_SID)).toBeUndefined(); // cleaned up
    });

    // Sweep 2026-07-25, 02-F1. The credential check sat inside
    // `if (storedFingerprint)`, which is undefined for any session THIS instance
    // has not seen — the normal case once Cloud Run scales out. So an
    // unauthenticated caller who merely knew a session id reached
    // `cleanupSession`, firing the store's delete hooks and with them a GCS bulk
    // delete of the victim's spilled report CSVs. Session ids are exposed to
    // browsers by design (`exposeHeaders: ["Mcp-Session-Id"]`).
    describe("unknown-session termination (02-F1)", () => {
      it("rejects an UNAUTHENTICATED delete of a session this instance does not hold", async () => {
        active = makeHarness();
        const res = await active.app.request("/mcp", {
          method: "DELETE",
          headers: { "mcp-session-id": VICTIM_SID }, // no credentials at all
        });
        expect(res.status).toBe(401);
      });

      it("does not fire delete hooks for a session this instance does not hold", async () => {
        // The destructive part: `deleteSpilledObjectsForSession` is registered
        // as an onDelete hook on six servers.
        active = makeHarness();
        const hook = vi.fn();
        active.store.onDelete(hook);

        const res = await active.app.request("/mcp", {
          method: "DELETE",
          headers: { "mcp-session-id": VICTIM_SID, "x-fake-cred": "mallory" },
        });

        // Authenticated, so accepted and idempotent — but it must not sweep a
        // session that is not this instance's to sweep.
        expect(res.status).toBe(200);
        expect(hook).not.toHaveBeenCalled();
      });

      it("still fires delete hooks for a session it does hold, with matching credentials", async () => {
        active = makeHarness();
        const hook = vi.fn();
        active.store.onDelete(hook);
        active.store.set(VICTIM_SID, { svc: "victim" }, "fp-victim");

        const res = await active.app.request("/mcp", {
          method: "DELETE",
          headers: { "mcp-session-id": VICTIM_SID, "x-fake-cred": "victim" },
        });

        expect(res.status).toBe(200);
        expect(hook).toHaveBeenCalledWith(VICTIM_SID);
      });

      it("rejects a malformed session id on DELETE", async () => {
        // `isValidSessionId` was applied on POST but never here, so any string
        // was accepted as a termination target.
        active = makeHarness();
        const res = await active.app.request("/mcp", {
          method: "DELETE",
          headers: { "mcp-session-id": "../../etc/passwd", "x-fake-cred": "mallory" },
        });
        expect(res.status).toBe(400);
      });
    });
  });

  describe("session capacity with supplied ids", () => {
    it("answers 404 for an unknown id even at capacity", async () => {
      active = makeHarness({ maxSessions: 1 });
      active.store.set(NEW_SID, { svc: "a" }, "fp-a"); // fill to capacity

      const res = await post(active.app, {
        "x-fake-cred": "mallory",
        "mcp-session-id": VICTIM_SID, // no allocation for an unknown id
      });

      expect(res.status).toBe(404);
      expect(active.createSessionForAuth).not.toHaveBeenCalled();
    });

    it("still serves a session it already holds when at capacity", async () => {
      // Reaching capacity must not evict existing clients — a request that
      // resolves to a held session allocates nothing.
      active = makeHarness({ maxSessions: 1 });
      active.store.set(VICTIM_SID, { svc: "victim" }, "fp-victim");

      const res = await post(active.app, {
        "x-fake-cred": "victim",
        "mcp-session-id": VICTIM_SID,
      });

      expect(res.status).not.toBe(503);
    });
  });
});

describe("createMcpHttpTransport — scope enforcement (#246)", () => {
  let active: Harness | undefined;
  afterEach(async () => {
    await active?.shutdown();
    active = undefined;
  });

  const callTool = (
    app: Harness["app"],
    name: string,
    headers: Record<string, string>
  ): Promise<Response> =>
    app.request("/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": PROTO,
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: {} },
      }),
    });

  const setup = () => {
    registerToolScopes([
      { name: "scopetest_get_entity", annotations: { readOnlyHint: true } },
      { name: "scopetest_update_entity", annotations: { readOnlyHint: false } },
      { name: "scopetest_unannotated" },
    ]);
    active = makeHarness({ authMode: "jwt", authType: "jwt" });
    return active.app;
  };

  it("returns 403 insufficient_scope with the exact challenge when a read token calls a write tool", async () => {
    const app = setup();
    const res = await callTool(app, "scopetest_update_entity", {
      "x-fake-cred": "alice",
      "x-fake-scope": "mcp:read",
    });
    expect(res.status).toBe(403);
    expect(res.headers.get("www-authenticate")).toBe(
      'Bearer error="insufficient_scope", scope="mcp:write", resource_metadata="http://localhost/.well-known/oauth-protected-resource"'
    );
    expect(await res.json()).toEqual({ error: "insufficient_scope", scope: "mcp:write" });
  });

  it("treats a tool with no readOnlyHint as a write (fail closed)", async () => {
    const app = setup();
    const res = await callTool(app, "scopetest_unannotated", {
      "x-fake-cred": "alice",
      "x-fake-scope": "mcp:read",
    });
    expect(res.status).toBe(403);
  });

  it("lets a read-scoped token call a read tool", async () => {
    const app = setup();
    const res = await callTool(app, "scopetest_get_entity", {
      "x-fake-cred": "alice",
      "x-fake-scope": "mcp:read",
    });
    expect(res.status).toBe(200);
  });

  it("lets a write-scoped token call both read and write tools", async () => {
    const app = setup();
    const headers = { "x-fake-cred": "alice", "x-fake-scope": "mcp:write" };
    expect((await callTool(app, "scopetest_update_entity", headers)).status).toBe(200);
    expect((await callTool(app, "scopetest_get_entity", headers)).status).toBe(200);
  });

  it("403s a held session too: scopes ride the request's token, not the session", async () => {
    const app = setup();
    // Session created by a full-access token, then reused with a read-only one.
    await post(app, { "x-fake-cred": "alice" });
    const sid = active!.createSessionForAuth.mock.calls[0]![1] as string;
    const res = await callTool(app, "scopetest_update_entity", {
      "x-fake-cred": "alice",
      "x-fake-scope": "mcp:read",
      "mcp-session-id": sid,
    });
    expect(res.status).toBe(403);
  });

  it("leaves a token with no scope claim unrestricted", async () => {
    const app = setup();
    const res = await callTool(app, "scopetest_update_entity", { "x-fake-cred": "alice" });
    expect(res.status).toBe(200);
  });

  it("does not interpret scopes outside jwt mode (e.g. Google API scopes)", async () => {
    registerToolScopes([{ name: "scopetest_update_entity", annotations: { readOnlyHint: false } }]);
    active = makeHarness({ authMode: "google-headers", authType: "google-service_account" });
    const res = await callTool(active.app, "scopetest_update_entity", {
      "x-fake-cred": "alice",
      "x-fake-scope": "https://www.googleapis.com/auth/display-video",
    });
    expect(res.status).toBe(200);
  });

  it("only checks tools/call: initialize and tools/list need no scope", async () => {
    const app = setup();
    const res = await post(app, { "x-fake-cred": "alice", "x-fake-scope": "mcp:read" });
    expect(res.status).not.toBe(403);
  });

  it("publishes the real scope names in the protected resource metadata and server card", async () => {
    const app = setup();
    const prm = await app.request("/.well-known/oauth-protected-resource");
    expect((await prm.json()).scopes_supported).toEqual(["mcp:read", "mcp:write"]);
    const card = await app.request("/.well-known/mcp/server-card.json");
    expect((await card.json()).auth.scopes_supported).toEqual(["mcp:read", "mcp:write"]);
  });
});

describe("createMcpHttpTransport — DNS-rebinding protection (#241)", () => {
  let active: Harness | undefined;
  afterEach(async () => {
    await active?.shutdown();
    active = undefined;
  });

  const CRED = { "x-fake-cred": "alice" };
  const rebinding = { host: "evil.example.com", origin: "http://evil.example.com", ...CRED };

  describe("loopback bind (self-host default: 127.0.0.1)", () => {
    it("rejects a rebinding request (Host and Origin evil.example.com) with 403", async () => {
      active = makeHarness({ host: "127.0.0.1" });
      const res = await post(active.app, rebinding);
      expect(res.status).toBe(403);
      expect(active.createSessionForAuth).not.toHaveBeenCalled();
    });

    it("rejects a foreign Host even with no Origin (non-browser rebinding)", async () => {
      active = makeHarness({ host: "127.0.0.1" });
      const res = await post(active.app, { host: "evil.example.com:3001", ...CRED });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toMatch(/Invalid host/);
    });

    it("rejects a foreign Origin behind a loopback Host", async () => {
      active = makeHarness({ host: "localhost" });
      const res = await post(active.app, {
        host: "localhost:3001",
        origin: "http://evil.example.com",
        ...CRED,
      });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toMatch(/Invalid origin/);
    });

    it.each(["localhost:3001", "127.0.0.1:3001", "[::1]:3001"])(
      "accepts Host %s with a matching loopback Origin",
      async (host) => {
        active = makeHarness({ host: "127.0.0.1" });
        const res = await post(active.app, { host, origin: `http://${host}`, ...CRED });
        expect(res.status).not.toBe(403);
        expect(active.createSessionForAuth).toHaveBeenCalledTimes(1);
      }
    );

    it("does not guard /health", async () => {
      active = makeHarness({ host: "127.0.0.1" });
      const res = await active.app.request("/health", { headers: { host: "evil.example.com" } });
      expect(res.status).toBe(200);
    });
  });

  describe("MCP_ALLOWED_HOSTS", () => {
    it("rejects an unlisted Host on a non-loopback bind", async () => {
      active = makeHarness({ host: "0.0.0.0", mcpAllowedHosts: "mcp.example.com" });
      const res = await post(active.app, { host: "evil.example.com", ...CRED });
      expect(res.status).toBe(403);
    });

    it("accepts a listed Host on a non-loopback bind", async () => {
      active = makeHarness({ host: "0.0.0.0", mcpAllowedHosts: "mcp.example.com" });
      const res = await post(active.app, { host: "mcp.example.com", ...CRED });
      expect(res.status).not.toBe(403);
      expect(active.createSessionForAuth).toHaveBeenCalledTimes(1);
    });
  });

  describe("non-loopback bind with no allow-lists (hosted default) — unchanged", () => {
    it("accepts any Host with no Origin, as before", async () => {
      active = makeHarness({ host: "0.0.0.0", nodeEnv: "production" });
      const res = await post(active.app, { host: "svc-abc-ew.a.run.app", ...CRED });
      expect(res.status).not.toBe(403);
      expect(active.createSessionForAuth).toHaveBeenCalledTimes(1);
    });

    it("accepts a rebinding-shaped request in development, as before", async () => {
      active = makeHarness({ host: "0.0.0.0", nodeEnv: "development" });
      const res = await post(active.app, rebinding);
      expect(res.status).not.toBe(403);
    });

    it("keeps production's Origin rule: no MCP_ALLOWED_ORIGINS rejects any Origin", async () => {
      active = makeHarness({ host: "0.0.0.0", nodeEnv: "production" });
      const res = await post(active.app, {
        host: "svc-abc-ew.a.run.app",
        origin: "https://app.example.com",
        ...CRED,
      });
      expect(res.status).toBe(403);
    });

    it("keeps an explicit MCP_ALLOWED_ORIGINS list", async () => {
      active = makeHarness({
        host: "0.0.0.0",
        nodeEnv: "production",
        mcpAllowedOrigins: "https://app.example.com",
      });
      const ok = await post(active.app, {
        host: "svc-abc-ew.a.run.app",
        origin: "https://app.example.com",
        ...CRED,
      });
      expect(ok.status).not.toBe(403);
    });
  });
});
