// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * #243: one `/mcp` endpoint serves both eras. A 2026-07-28 request (per-request
 * `_meta` envelope, no `Mcp-Session-Id`) is served by the SDK's stateless
 * handler with services keyed on the caller's credential fingerprint; a
 * 2025-era request keeps the sessionful path unchanged.
 *
 * These drive the real Hono app with a real `McpServer`, so the modern leg runs
 * the SDK's own validation ladder (`-32022`, `-32020`, `server/discover`).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import pino from "pino";
import { z } from "zod";
import {
  McpServer,
  PROTOCOL_VERSION_META_KEY,
  CLIENT_INFO_META_KEY,
  CLIENT_CAPABILITIES_META_KEY,
} from "@modelcontextprotocol/server";
import {
  createMcpHttpTransport,
  type TransportFactoryConfig,
  type TransportFactoryAppConfig,
} from "../../src/utils/transport/mcp-http-transport-factory.js";
import { SessionServiceStore } from "../../src/utils/transport/session-store.js";
import {
  isValidSessionId,
  principalSessionKey,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "../../src/utils/transport/mcp-transport-helpers.js";
import { registerToolScopes } from "../../src/auth/tool-scopes.js";
import type { AuthStrategy, AuthResult } from "../../src/auth/auth-strategy.js";

const MODERN = "2026-07-28";

function fakeAuthStrategy(authType: string): AuthStrategy {
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

function makeHarness(opts: { authMode?: string; host?: string } = {}) {
  const logger = pino({ level: "silent" });
  const store = new SessionServiceStore<{ svc: string }>(1000);
  const createSessionForAuth = vi.fn(async (authResult: AuthResult, key: string) => {
    store.set(key, { svc: authResult.authInfo.clientId }, authResult.credentialFingerprint);
    return { services: {} };
  });

  const platformConfig: TransportFactoryConfig = {
    authStrategy: fakeAuthStrategy(opts.authMode === "jwt" ? "jwt" : "fake"),
    corsAllowHeaders: ["Content-Type", "X-Fake-Cred", "X-Fake-Scope"],
    authErrorHint: "provide X-Fake-Cred",
    sessionServiceStore: store as unknown as TransportFactoryConfig["sessionServiceStore"],
    createSessionForAuth:
      createSessionForAuth as unknown as TransportFactoryConfig["createSessionForAuth"],
    createMcpServer: (async (_log: unknown, key: string) => {
      const server = new McpServer({ name: "probe", version: "0.0.0" }, { capabilities: {} });
      server.registerTool(
        "probe_whoami",
        { description: "returns the services owner", inputSchema: z.object({}) },
        async () => ({
          content: [{ type: "text" as const, text: (store.get(key) as { svc: string }).svc }],
        })
      );
      return server;
    }) as unknown as TransportFactoryConfig["createMcpServer"],
    packageJsonPath: "nonexistent-package.json",
  };
  const config: TransportFactoryAppConfig = {
    serviceName: "test-mcp",
    nodeEnv: "test",
    port: 0,
    host: opts.host ?? "127.0.0.1",
    mcpAuthMode: opts.authMode ?? "fake",
    mcpStatefulSessionTimeoutMs: 60_000,
  };
  const { app, shutdown } = createMcpHttpTransport(config, logger, platformConfig);
  return { app, store, createSessionForAuth, shutdown };
}

const meta = (extra: Record<string, unknown> = {}) => ({
  [PROTOCOL_VERSION_META_KEY]: MODERN,
  [CLIENT_INFO_META_KEY]: { name: "c", version: "0.0.0" },
  [CLIENT_CAPABILITIES_META_KEY]: {},
  ...extra,
});

function modernPost(
  app: { request: (p: string, i?: RequestInit) => Promise<Response> },
  method: string,
  params: Record<string, unknown>,
  headers: Record<string, string> = {},
  protocolHeader: string = MODERN
) {
  return app.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": protocolHeader,
      "mcp-method": method,
      ...(typeof params.name === "string" ? { "mcp-name": params.name } : {}),
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 7,
      method,
      params: { ...params, _meta: meta((params._meta as Record<string, unknown>) ?? {}) },
    }),
  });
}

async function readJsonRpc(res: Response): Promise<Record<string, any>> {
  const text = await res.text();
  if (res.headers.get("content-type")?.includes("text/event-stream")) {
    const data = text
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .filter(Boolean);
    return JSON.parse(data[data.length - 1]!);
  }
  return JSON.parse(text);
}

describe("2026-07-28 stateless serving (#243)", () => {
  let active: ReturnType<typeof makeHarness> | undefined;
  afterEach(async () => {
    await active?.shutdown();
    active = undefined;
  });

  it("advertises the modern revision next to the 2025 ones", () => {
    expect(SUPPORTED_PROTOCOL_VERSIONS).toContain(MODERN);
    expect(SUPPORTED_PROTOCOL_VERSIONS).toContain("2025-11-25");
  });

  it("serves a tools/call without any Mcp-Session-Id and mints none", async () => {
    active = makeHarness();
    const res = await modernPost(
      active.app,
      "tools/call",
      { name: "probe_whoami", arguments: {} },
      { "x-fake-cred": "alice" }
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("mcp-session-id")).toBeNull();
    const body = await readJsonRpc(res);
    expect(body.result.content[0].text).toBe("alice");
  });

  it("answers server/discover", async () => {
    active = makeHarness();
    const res = await modernPost(active.app, "server/discover", {}, { "x-fake-cred": "alice" });
    expect(res.status).toBe(200);
    const body = await readJsonRpc(res);
    expect(JSON.stringify(body.result)).toContain(MODERN);
  });

  it("keys services on the credential, not on a session id", async () => {
    active = makeHarness();
    const call = (cred: string) =>
      modernPost(
        active!.app,
        "tools/call",
        { name: "probe_whoami", arguments: {} },
        { "x-fake-cred": cred }
      ).then(readJsonRpc);

    expect((await call("alice")).result.content[0].text).toBe("alice");
    expect((await call("alice")).result.content[0].text).toBe("alice");
    expect((await call("bob")).result.content[0].text).toBe("bob");

    // One services entry per principal, built once; neither key is a legacy session id.
    expect(active.createSessionForAuth).toHaveBeenCalledTimes(2);
    expect(active.store.size).toBe(2);
    const alice = principalSessionKey("fp-alice");
    const bob = principalSessionKey("fp-bob");
    expect(alice).not.toBe(bob);
    expect(active.store.get(alice)).toEqual({ svc: "alice" });
    expect(active.store.get(bob)).toEqual({ svc: "bob" });
    expect(isValidSessionId(alice)).toBe(false);
    // Another principal's key is simply a different, unknown key: not-found, not forbidden.
    expect(active.store.get(principalSessionKey("fp-carol"))).toBeUndefined();
  });

  it("builds a principal's services once for concurrent first requests", async () => {
    active = makeHarness();
    const results = await Promise.all(
      [1, 2, 3, 4].map(() =>
        modernPost(
          active!.app,
          "tools/call",
          { name: "probe_whoami", arguments: {} },
          { "x-fake-cred": "alice" }
        ).then(readJsonRpc)
      )
    );
    expect(results.every((r) => r.result?.content?.[0]?.text === "alice")).toBe(true);
    expect(active.createSessionForAuth).toHaveBeenCalledTimes(1);
  });

  it("rejects an unauthenticated modern request with a JSON-RPC 401 and the challenge", async () => {
    active = makeHarness({ authMode: "jwt" });
    const res = await modernPost(active.app, "tools/list", {});
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
    const body = await res.json();
    expect(body).toMatchObject({ jsonrpc: "2.0", id: 7, error: { message: "no credentials" } });
    expect(active.createSessionForAuth).not.toHaveBeenCalled();
  });

  it("answers an unsupported protocol version as -32022 with HTTP 400", async () => {
    active = makeHarness();
    const res = await modernPost(
      active.app,
      "tools/list",
      { _meta: { [PROTOCOL_VERSION_META_KEY]: "2099-01-01" } },
      { "x-fake-cred": "alice" },
      "2099-01-01"
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32022);
  });

  it("answers a header/body mismatch as -32020 with HTTP 400", async () => {
    active = makeHarness();
    const res = await modernPost(
      active.app,
      "tools/call",
      { name: "probe_whoami", arguments: {} },
      { "x-fake-cred": "alice", "mcp-method": "tools/list" }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32020);
  });

  it("refuses a header/body mismatch before building any services (#248)", async () => {
    active = makeHarness();
    const res = await modernPost(
      active.app,
      "tools/call",
      { name: "probe_whoami", arguments: {} },
      { "x-fake-cred": "alice", "mcp-name": "some_other_tool" }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe(-32020);
    expect(body.id).toBe(7);
    expect(active.createSessionForAuth).not.toHaveBeenCalled();
  });

  it("still answers 401 before any header check", async () => {
    active = makeHarness();
    const res = await modernPost(
      active.app,
      "tools/call",
      { name: "probe_whoami" },
      {
        "mcp-method": "tools/list",
      }
    );
    expect(res.status).toBe(401);
  });

  it("returns a JSON-RPC 403 for a scoped token calling a write tool", async () => {
    registerToolScopes([{ name: "probe_whoami", annotations: { readOnlyHint: false } }]);
    active = makeHarness({ authMode: "jwt" });
    const res = await modernPost(
      active.app,
      "tools/call",
      { name: "probe_whoami", arguments: {} },
      { "x-fake-cred": "alice", "x-fake-scope": "mcp:read" }
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("www-authenticate")).toContain("insufficient_scope");
    expect(await res.json()).toMatchObject({
      jsonrpc: "2.0",
      error: { message: "insufficient_scope", data: { scope: "mcp:write" } },
    });
    registerToolScopes([{ name: "probe_whoami", annotations: { readOnlyHint: true } }]);
  });

  it("keeps DNS-rebinding protection on modern requests", async () => {
    active = makeHarness();
    const res = await modernPost(
      active.app,
      "tools/list",
      {},
      { "x-fake-cred": "alice", host: "evil.example" }
    );
    expect(res.status).toBe(403);
    // A rejection made before routing is still a JSON-RPC error on the modern path.
    expect(await res.json()).toMatchObject({
      jsonrpc: "2.0",
      id: 7,
      error: { code: -32005, message: expect.stringContaining("DNS rebinding") },
    });
  });

  it("keeps the plain 403 body for a 2025-era request", async () => {
    active = makeHarness();
    const res = await active.app.request("/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "mcp-protocol-version": "2025-06-18",
        "x-fake-cred": "alice",
        host: "evil.example",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Invalid host. DNS rebinding protection." });
  });

  it("answers an oversized modern body with a JSON-RPC 413", async () => {
    active = makeHarness();
    const huge = "x".repeat(10 * 1024 * 1024 + 1024);
    const res = await active.app.request("/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": MODERN,
        "mcp-method": "tools/list",
        "x-fake-cred": "alice",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 7,
        method: "tools/list",
        params: { _meta: meta({ pad: huge }) },
      }),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({
      jsonrpc: "2.0",
      error: { code: -32600, message: "Request body too large" },
    });
  });

  it("leaves the 2025 path unchanged: initialize mints a session id, unknown ids get 404", async () => {
    active = makeHarness();
    const init = await active.app.request("/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
        "x-fake-cred": "alice",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "legacy", version: "0.0.0" },
        },
      }),
    });
    expect(init.status).toBe(200);
    const sid = init.headers.get("mcp-session-id");
    expect(sid && isValidSessionId(sid)).toBe(true);

    const unknown = await active.app.request("/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "mcp-protocol-version": "2025-06-18",
        "mcp-session-id": "ab".repeat(32),
        "x-fake-cred": "alice",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }),
    });
    expect(unknown.status).toBe(404);
  });
});
