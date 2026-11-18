// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `oauth` mode (#246, option A): access tokens verified against a configured
 * issuer's JWKS. Real keypairs and a stub JWKS HTTP endpoint; no mocks of jose.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import * as jose from "jose";
import {
  OAuthJwksAuthStrategy,
  loadOAuthJwksConfig,
  OAUTH_ALLOWED_ALGORITHMS,
  type OAuthJwksConfig,
} from "../../src/auth/oauth-jwks.js";
import { createAuthStrategy, JwtBearerAuthStrategy } from "../../src/auth/auth-strategy.js";
import { McpError } from "../../src/utils/mcp-errors.js";

const ISSUER = "https://auth.example.com";
const AUDIENCE = "https://mcp.example.com";

interface Signer {
  kid: string;
  privateKey: jose.CryptoKey;
  publicJwk: jose.JWK;
}

async function newSigner(kid: string, alg = "RS256"): Promise<Signer> {
  const { publicKey, privateKey } = await jose.generateKeyPair(alg, { extractable: true });
  const publicJwk = await jose.exportJWK(publicKey);
  return { kid, privateKey, publicJwk: { ...publicJwk, kid, alg, use: "sig" } };
}

let server: Server;
let jwksUri: string;
let served: jose.JWK[] = [];
let jwksHits = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/jwks") {
      jwksHits++;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ keys: served }));
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  jwksUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/jwks`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

let key: Signer;
beforeEach(async () => {
  key = await newSigner("key-1");
  served = [key.publicJwk];
  jwksHits = 0;
});

function strategy(overrides: Partial<OAuthJwksConfig> = {}): OAuthJwksAuthStrategy {
  return new OAuthJwksAuthStrategy({
    issuer: ISSUER,
    jwksUri,
    audience: AUDIENCE,
    cooldownMs: 0,
    ...overrides,
  });
}

interface TokenOpts {
  signer?: Signer;
  alg?: string;
  kid?: string;
  iss?: string;
  aud?: string;
  sub?: string | null;
  exp?: number | string;
  iat?: boolean;
  claims?: Record<string, unknown>;
  header?: Record<string, unknown>;
}

async function token(o: TokenOpts = {}): Promise<string> {
  const s = o.signer ?? key;
  const jwt = new jose.SignJWT({ ...(o.claims ?? {}) })
    .setProtectedHeader({ alg: o.alg ?? "RS256", kid: o.kid ?? s.kid, ...(o.header ?? {}) })
    .setIssuer(o.iss ?? ISSUER)
    .setAudience(o.aud ?? AUDIENCE)
    .setExpirationTime(o.exp ?? "1h");
  if (o.sub !== null) jwt.setSubject(o.sub ?? "user-1");
  if (o.iat !== false) jwt.setIssuedAt();
  return jwt.sign(s.privateKey);
}

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

async function rejects(t: string, s = strategy()): Promise<McpError> {
  const err = await s.verify(bearer(t)).then(
    () => null,
    (e: unknown) => e
  );
  expect(err).toBeInstanceOf(McpError);
  return err as McpError;
}

describe("OAuthJwksAuthStrategy", () => {
  it("accepts a valid token and exposes subject, scopes and fingerprint", async () => {
    const res = await strategy().verify(
      bearer(await token({ claims: { scope: "mcp:read mcp:write" } }))
    );
    expect(res.authInfo).toMatchObject({
      clientId: "user-1",
      subject: "user-1",
      authType: "oauth",
      scopes: ["mcp:read", "mcp:write"],
    });
    expect(res.credentialFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reads scopes from an `scp` array and treats a missing scope claim as no scopes", async () => {
    const withScp = await strategy().verify(bearer(await token({ claims: { scp: ["mcp:read"] } })));
    expect(withScp.authInfo.scopes).toEqual(["mcp:read"]);
    const none = await strategy().verify(bearer(await token()));
    expect(none.authInfo.scopes).toEqual([]);
  });

  it("passes allowed_advertisers through and rejects a malformed one", async () => {
    const ok = await strategy().verify(
      bearer(await token({ claims: { allowed_advertisers: ["1", "2"] } }))
    );
    expect(ok.allowedAdvertisers).toEqual(["1", "2"]);
    await rejects(await token({ claims: { allowed_advertisers: "1" } }));
  });

  it("rejects a wrong issuer", async () => {
    await rejects(await token({ iss: "https://evil.example.com" }));
  });

  it("rejects a wrong audience", async () => {
    await rejects(await token({ aud: "https://other.example.com" }));
  });

  it("rejects an expired token", async () => {
    const err = await rejects(await token({ exp: Math.floor(Date.now() / 1000) - 3600 }));
    expect(err.message).toBe("Token has expired");
  });

  it("rejects tokens missing required claims (sub, exp, iat)", async () => {
    await rejects(await token({ sub: null }));
    await rejects(await token({ iat: false }));
    // no exp
    const noExp = await new jose.SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: key.kid })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject("u")
      .setIssuedAt()
      .sign(key.privateKey);
    await rejects(noExp);
  });

  it("rejects a token signed by a key the JWKS does not publish (same kid)", async () => {
    const attacker = await newSigner("key-1");
    await rejects(await token({ signer: attacker }));
  });

  it("rejects `alg: none`", async () => {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64({ alg: "none", kid: "key-1" })}.${b64({
      iss: ISSUER,
      aud: AUDIENCE,
      sub: "u",
      iat: now,
      exp: now + 3600,
    })}.`;
    await rejects(unsigned);
  });

  it("rejects the HS256-signed-with-the-public-key confusion attack", async () => {
    // The attacker signs an HMAC using the (public) JWKS material as the secret.
    const spki = await jose.exportSPKI(
      (await jose.importJWK(key.publicJwk, "RS256")) as jose.CryptoKey
    );
    const forged = await new jose.SignJWT({})
      .setProtectedHeader({ alg: "HS256", kid: key.kid })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject("admin")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(spki));
    await rejects(forged);
  });

  it("never accepts any HS* or none algorithm by construction", () => {
    for (const alg of OAUTH_ALLOWED_ALGORITHMS) {
      expect(alg.startsWith("HS")).toBe(false);
      expect(alg).not.toBe("none");
    }
  });

  it("rejects an unknown kid", async () => {
    const other = await newSigner("key-unknown");
    await rejects(await token({ signer: other }));
  });

  it("picks up a rotated key (new kid) and drops a removed one", async () => {
    const s = strategy();
    await s.verify(bearer(await token()));
    const rotated = await newSigner("key-2");
    served = [rotated.publicJwk]; // key-1 retired, key-2 published
    await s.verify(bearer(await token({ signer: rotated })));
    // The retired key's tokens stop verifying once the set has refreshed.
    await rejects(await token(), s);
  });

  it("does not hammer the JWKS endpoint for repeated unknown kids (cooldown)", async () => {
    const s = strategy({ cooldownMs: 60_000 });
    await s.verify(bearer(await token())); // initial fetch
    const before = jwksHits;
    const other = await newSigner("nope");
    for (let i = 0; i < 5; i++) await rejects(await token({ signer: other }), s);
    expect(jwksHits - before).toBeLessThanOrEqual(1);
  });

  it("rejects tokens naming their own key material (jku / jwk / x5u)", async () => {
    await rejects(await token({ header: { jku: "https://evil.example.com/jwks" } }));
    await rejects(await token({ header: { jwk: key.publicJwk } }));
    await rejects(await token({ header: { x5u: "https://evil.example.com/cert" } }));
  });

  it("rejects missing, malformed and non-bearer Authorization headers", async () => {
    await expect(strategy().verify({})).rejects.toBeInstanceOf(McpError);
    await expect(strategy().verify({ authorization: "Basic abc" })).rejects.toBeInstanceOf(
      McpError
    );
    await rejects("not-a-jwt");
  });

  it("fails closed when the JWKS endpoint is unreachable", async () => {
    const s = strategy({ jwksUri: "http://127.0.0.1:1/jwks", timeoutMs: 500 });
    await rejects(await token(), s);
  });

  it("fingerprint changes when scopes change and is stable across reissue", async () => {
    const s = strategy();
    const a = await s.getCredentialFingerprint(
      bearer(await token({ claims: { scope: "mcp:read" } }))
    );
    const b = await s.getCredentialFingerprint(
      bearer(await token({ claims: { scope: "mcp:read" } }))
    );
    const c = await s.getCredentialFingerprint(
      bearer(await token({ claims: { scope: "mcp:read mcp:write" } }))
    );
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("no fallback between oauth and jwt modes", () => {
  const SECRET = "test-jwt-secret-at-least-32-chars-long";

  it("a JWKS-verified token is not accepted by the HS256 strategy", async () => {
    const hs = new JwtBearerAuthStrategy(SECRET);
    await expect(hs.verify(bearer(await token()))).rejects.toBeInstanceOf(McpError);
  });

  it("an HS256 token is not accepted by the oauth strategy, even with matching claims", async () => {
    const hs = await new jose.SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject("svc")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(SECRET));
    await rejects(hs);
  });

  it("the oauth strategy never reads MCP_AUTH_SECRET_KEY", async () => {
    const prev = process.env.MCP_AUTH_SECRET_KEY;
    process.env.MCP_AUTH_SECRET_KEY = SECRET;
    try {
      const hs = await new jose.SignJWT({})
        .setProtectedHeader({ alg: "HS256", kid: "key-1" })
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setSubject("svc")
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode(SECRET));
      await rejects(hs);
    } finally {
      if (prev === undefined) delete process.env.MCP_AUTH_SECRET_KEY;
      else process.env.MCP_AUTH_SECRET_KEY = prev;
    }
  });
});

describe("loadOAuthJwksConfig / createAuthStrategy('oauth')", () => {
  const good = {
    MCP_OAUTH_ISSUER: ISSUER,
    MCP_JWKS_URI: `${ISSUER}/.well-known/jwks.json`,
    MCP_RESOURCE_URI: AUDIENCE,
  };

  it("reads issuer, JWKS URI and audience from the environment", () => {
    expect(loadOAuthJwksConfig(good)).toEqual({
      issuer: ISSUER,
      jwksUri: `${ISSUER}/.well-known/jwks.json`,
      audience: AUDIENCE,
    });
  });

  it.each([
    ["issuer", { ...good, MCP_OAUTH_ISSUER: undefined }],
    ["jwks uri", { ...good, MCP_JWKS_URI: undefined }],
    ["resource uri (no default audience)", { ...good, MCP_RESOURCE_URI: undefined }],
    ["http issuer", { ...good, MCP_OAUTH_ISSUER: "http://auth.example.com" }],
    ["http jwks", { ...good, MCP_JWKS_URI: "http://auth.example.com/jwks" }],
    ["non-url audience", { ...good, MCP_RESOURCE_URI: "cesteral-services" }],
  ])("refuses to start with a missing/insecure %s", (_name, env) => {
    expect(() => loadOAuthJwksConfig(env)).toThrow(/misconfigured/);
  });

  it("createAuthStrategy('oauth') fails closed without configuration", () => {
    const saved = { ...process.env };
    delete process.env.MCP_OAUTH_ISSUER;
    delete process.env.MCP_JWKS_URI;
    try {
      expect(() => createAuthStrategy("oauth")).toThrow(/misconfigured/);
    } finally {
      process.env = saved;
    }
  });
});
