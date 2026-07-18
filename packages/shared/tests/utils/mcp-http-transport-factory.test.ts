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
 *   - cold-instance rebuild binds the client-supplied id to the CALLER's
 *     credentials (the "scale-out rebuild doesn't weaken binding" claim),
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
} from "../../src/utils/mcp-http-transport-factory.js";
import { SessionServiceStore } from "../../src/utils/session-store.js";
import type { AuthStrategy, AuthResult } from "../../src/auth/auth-strategy.js";

// 64 hex chars — matches the isValidSessionId pattern /^[a-f0-9-]{20,100}$/i.
const VICTIM_SID = "a1b2c3d4".repeat(8);
const NEW_SID = "f0e1d2c3".repeat(8);

const PROTO = "2025-06-18";

/** Fake strategy: fingerprint is `fp-<x-fake-cred>`; absent cred → auth fails. */
function fakeAuthStrategy(): AuthStrategy {
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
        authInfo: { clientId: f.slice(3), authType: "fake" },
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

function makeHarness(opts: { maxSessions?: number } = {}): Harness {
  const logger = pino({ level: "silent" });
  const store = new SessionServiceStore<{ svc: string }>(opts.maxSessions ?? 1000);

  // Mimics a real consumer: build services and bind the fingerprint.
  const createSessionForAuth = vi.fn(async (authResult: AuthResult, sessionId: string) => {
    const services = { svc: authResult.authInfo.clientId };
    store.set(sessionId, services, authResult.credentialFingerprint);
    return { services };
  });

  const platformConfig: TransportFactoryConfig = {
    authStrategy: fakeAuthStrategy(),
    corsAllowHeaders: ["Content-Type", "Mcp-Session-Id", "X-Fake-Cred"],
    authErrorHint: "provide X-Fake-Cred",
    sessionServiceStore: store as unknown as TransportFactoryConfig["sessionServiceStore"],
    createSessionForAuth:
      createSessionForAuth as unknown as TransportFactoryConfig["createSessionForAuth"],
    createMcpServer: async () => ({ connect: async () => {}, close: async () => {} }),
    packageJsonPath: "nonexistent-package.json", // read fails → version "unknown" (harmless)
  };

  const config: TransportFactoryAppConfig = {
    serviceName: "test-mcp",
    nodeEnv: "test",
    port: 0,
    host: "127.0.0.1",
    mcpAuthMode: "fake",
    mcpStatefulSessionTimeoutMs: 60_000,
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
      headers: { "content-type": "application/json", "mcp-protocol-version": "1999-01-01" },
      body: "{}",
    });
    expect(res.status).toBe(400);
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

  it("rebuild on a cold instance binds the client-supplied id to the caller, not a victim", async () => {
    active = makeHarness();
    // Store is empty (scaled-out instance that never saw VICTIM_SID). Mallory
    // presents the victim's leaked session id with HER OWN credentials.
    await post(active.app, { "mcp-session-id": VICTIM_SID, "x-fake-cred": "mallory" });

    // Rebuild re-authenticates and binds the id to Mallory — she gets her own
    // client, never the victim's. The claim: rebuild does not weaken binding.
    expect(active.createSessionForAuth).toHaveBeenCalledTimes(1);
    const [authResult, sessionId] = active.createSessionForAuth.mock.calls[0]!;
    expect(sessionId).toBe(VICTIM_SID);
    expect((authResult as AuthResult).credentialFingerprint).toBe("fp-mallory");
    expect(active.store.getFingerprint(VICTIM_SID)).toBe("fp-mallory");
  });

  it("rejects a rebuild attempt with no credentials (cold instance, unknown id)", async () => {
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
  });
});
