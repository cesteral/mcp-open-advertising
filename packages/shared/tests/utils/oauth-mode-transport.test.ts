// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `MCP_AUTH_MODE=oauth` through the real transport factory with the real JWKS
 * strategy: PRM shape, 401 challenge, and the 403 insufficient_scope step-up
 * for JWKS-verified tokens (#246, option A).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import pino from "pino";
import * as jose from "jose";
import {
  createMcpHttpTransport,
  type TransportFactoryConfig,
  type TransportFactoryAppConfig,
} from "../../src/utils/transport/mcp-http-transport-factory.js";
import { SessionServiceStore } from "../../src/utils/transport/session-store.js";
import { registerToolScopes } from "../../src/auth/tool-scopes.js";
import { OAuthJwksAuthStrategy } from "../../src/auth/oauth-jwks.js";
import type { AuthResult } from "../../src/auth/auth-strategy.js";

const ISSUER = "https://auth.example.com";
const RESOURCE = "https://mcp.example.com";
const PROTO = "2025-06-18";

let jwksServer: Server;
let jwksUri: string;
let privateKey: jose.CryptoKey;
const ENV_KEYS = ["MCP_OAUTH_ISSUER", "MCP_RESOURCE_URI", "MCP_AUTHORIZATION_SERVERS"] as const;
const saved: Record<string, string | undefined> = {};

beforeAll(async () => {
  const kp = await jose.generateKeyPair("ES256", { extractable: true });
  privateKey = kp.privateKey;
  const jwk = { ...(await jose.exportJWK(kp.publicKey)), kid: "k1", alg: "ES256" };
  jwksServer = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((r) => jwksServer.listen(0, "127.0.0.1", r));
  jwksUri = `http://127.0.0.1:${(jwksServer.address() as AddressInfo).port}/jwks`;
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.MCP_OAUTH_ISSUER = ISSUER;
  process.env.MCP_RESOURCE_URI = RESOURCE;
  delete process.env.MCP_AUTHORIZATION_SERVERS;
});

afterAll(async () => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  await new Promise<void>((r) => jwksServer.close(() => r()));
});

let shutdown: (() => Promise<void>) | undefined;
afterEach(async () => {
  await shutdown?.();
  shutdown = undefined;
});

function makeApp() {
  const logger = pino({ level: "silent" });
  const store = new SessionServiceStore<{ svc: string }>(100);
  registerToolScopes([
    { name: "oauthtest_get_entity", annotations: { readOnlyHint: true } },
    { name: "oauthtest_update_entity", annotations: { readOnlyHint: false } },
  ]);
  const platformConfig: TransportFactoryConfig = {
    authStrategy: new OAuthJwksAuthStrategy({ issuer: ISSUER, jwksUri, audience: RESOURCE }),
    corsAllowHeaders: ["Content-Type", "Authorization", "Mcp-Session-Id"],
    authErrorHint: "Provide a valid Bearer token",
    sessionServiceStore: store as unknown as TransportFactoryConfig["sessionServiceStore"],
    createSessionForAuth: (async (authResult: AuthResult, sessionId: string) => {
      const services = { svc: authResult.authInfo.clientId };
      store.set(sessionId, services, authResult.credentialFingerprint);
      return { services };
    }) as unknown as TransportFactoryConfig["createSessionForAuth"],
    createMcpServer: async () => ({
      connect: async (transport) => {
        transport.onmessage = (message) => {
          const id = (message as { id?: number | string }).id;
          if (id !== undefined) void transport.send({ jsonrpc: "2.0", id, result: {} });
        };
      },
      close: async () => {},
    }),
    packageJsonPath: "nonexistent-package.json",
  };
  const config: TransportFactoryAppConfig = {
    serviceName: "test-mcp",
    nodeEnv: "test",
    port: 0,
    host: "127.0.0.1",
    mcpAuthMode: "oauth",
    mcpStatefulSessionTimeoutMs: 60_000,
  };
  const built = createMcpHttpTransport(config, logger, platformConfig);
  shutdown = built.shutdown;
  return built.app as unknown as { request: (p: string, i?: RequestInit) => Promise<Response> };
}

async function tokenWith(scope?: string, overrides: { aud?: string } = {}): Promise<string> {
  return new jose.SignJWT(scope === undefined ? {} : { scope })
    .setProtectedHeader({ alg: "ES256", kid: "k1" })
    .setIssuer(ISSUER)
    .setAudience(overrides.aud ?? RESOURCE)
    .setSubject("alice")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

const callTool = (app: ReturnType<typeof makeApp>, name: string, token?: string) =>
  app.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTO,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: {} },
    }),
  });

describe("oauth mode through the transport factory", () => {
  it("publishes complete protected-resource metadata with the issuer as authorization server", async () => {
    const res = await makeApp().request("/.well-known/oauth-protected-resource");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      resource: RESOURCE,
      bearer_methods_supported: ["header"],
      scopes_supported: ["mcp:read", "mcp:write"],
      authorization_servers: [ISSUER],
    });
  });

  it("MCP_AUTHORIZATION_SERVERS overrides the default authorization server list", async () => {
    process.env.MCP_AUTHORIZATION_SERVERS = "https://as2.example.com";
    try {
      const body = await (await makeApp().request("/.well-known/oauth-protected-resource")).json();
      expect((body as { authorization_servers: string[] }).authorization_servers).toEqual([
        "https://as2.example.com",
      ]);
    } finally {
      delete process.env.MCP_AUTHORIZATION_SERVERS;
    }
  });

  it("answers 401 with a Bearer challenge carrying resource_metadata when no token is sent", async () => {
    const res = await callTool(makeApp(), "oauthtest_get_entity");
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(
      `Bearer realm="mcp", resource_metadata="${RESOURCE}/.well-known/oauth-protected-resource"`
    );
  });

  it("answers 401 for a token with the wrong audience", async () => {
    const res = await callTool(
      makeApp(),
      "oauthtest_get_entity",
      await tokenWith("mcp:read", { aud: "https://other.example.com" })
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("resource_metadata=");
  });

  it("allows a read tool with mcp:read", async () => {
    const res = await callTool(makeApp(), "oauthtest_get_entity", await tokenWith("mcp:read"));
    expect(res.status).toBe(200);
  });

  it("returns 403 insufficient_scope for a write tool with a read-only token", async () => {
    const res = await callTool(makeApp(), "oauthtest_update_entity", await tokenWith("mcp:read"));
    expect(res.status).toBe(403);
    expect(res.headers.get("www-authenticate")).toBe(
      `Bearer error="insufficient_scope", scope="mcp:write", resource_metadata="${RESOURCE}/.well-known/oauth-protected-resource"`
    );
    expect(await res.json()).toEqual({ error: "insufficient_scope", scope: "mcp:write" });
  });

  it("allows a write tool with mcp:write", async () => {
    const res = await callTool(makeApp(), "oauthtest_update_entity", await tokenWith("mcp:write"));
    expect(res.status).toBe(200);
  });

  it("fails closed: a token with no scope claim cannot call any tool (403, unlike jwt mode)", async () => {
    const res = await callTool(makeApp(), "oauthtest_get_entity", await tokenWith());
    expect(res.status).toBe(403);
    expect(res.headers.get("www-authenticate")).toContain('scope="mcp:read"');
  });
});
