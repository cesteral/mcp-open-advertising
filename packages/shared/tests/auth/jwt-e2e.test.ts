/**
 * JWT E2E Tests — Shared Auth
 *
 * Uses `jose` to generate real JWT tokens and tests the full
 * JwtBearerAuthStrategy verify flow. No server needed — tests
 * the strategy directly with real cryptographic operations.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as jose from "jose";
import { JwtBearerAuthStrategy } from "../../src/auth/auth-strategy.js";
import { McpError } from "../../src/utils/mcp-errors.js";

const SECRET = "test-jwt-secret-at-least-32-chars-long";
const ISSUER = "cesteral-mcp";
const AUDIENCE = "cesteral-services";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.JWT_ISSUER = ISSUER;
  process.env.MCP_RESOURCE_URI = AUDIENCE;
});

afterEach(() => {
  // Restore or delete env vars — assignment of undefined sets the string "undefined"
  for (const key of ["JWT_ISSUER", "MCP_RESOURCE_URI"]) {
    if (ORIGINAL_ENV[key] !== undefined) {
      process.env[key] = ORIGINAL_ENV[key];
    } else {
      delete process.env[key];
    }
  }
});

async function createToken(
  overrides: {
    sub?: string;
    iss?: string;
    aud?: string;
    exp?: number;
    secret?: string;
  } = {}
): Promise<string> {
  const secretKey = new TextEncoder().encode(overrides.secret ?? SECRET);
  const builder = new jose.SignJWT({ sub: overrides.sub ?? "user-123" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(overrides.iss ?? ISSUER)
    .setAudience(overrides.aud ?? AUDIENCE);

  if (overrides.exp !== undefined) {
    // Set absolute expiration
    builder.setExpirationTime(overrides.exp);
  } else {
    builder.setExpirationTime("1h");
  }

  return builder.sign(secretKey);
}

describe("jwt e2e — real token generation and verification", () => {
  it("valid JWT → session created with correct claims", async () => {
    const strategy = new JwtBearerAuthStrategy(SECRET);
    const token = await createToken({ sub: "user-abc" });

    const result = await strategy.verify({
      authorization: `Bearer ${token}`,
    });

    expect(result.authInfo.clientId).toBe("user-abc");
    expect(result.authInfo.authType).toBe("jwt");
    expect(result.authInfo.subject).toBe("user-abc");
    expect(result.credentialFingerprint).toBeDefined();
    expect(typeof result.credentialFingerprint).toBe("string");
  });

  it("expired JWT → rejected with McpError", async () => {
    const strategy = new JwtBearerAuthStrategy(SECRET);
    // Create token that expired 1 hour ago
    const expiredTime = Math.floor(Date.now() / 1000) - 3600;
    const token = await createToken({ exp: expiredTime });

    await expect(strategy.verify({ authorization: `Bearer ${token}` })).rejects.toThrow(McpError);
  });

  it("invalid signature → rejected with McpError", async () => {
    const strategy = new JwtBearerAuthStrategy(SECRET);
    const token = await createToken({ secret: "wrong-secret-different-key-here" });

    await expect(strategy.verify({ authorization: `Bearer ${token}` })).rejects.toThrow(McpError);
  });

  it("wrong issuer → rejected", async () => {
    const strategy = new JwtBearerAuthStrategy(SECRET);
    const token = await createToken({ iss: "wrong-issuer" });

    await expect(strategy.verify({ authorization: `Bearer ${token}` })).rejects.toThrow(McpError);
  });

  it("wrong audience → rejected", async () => {
    const strategy = new JwtBearerAuthStrategy(SECRET);
    const token = await createToken({ aud: "wrong-audience" });

    await expect(strategy.verify({ authorization: `Bearer ${token}` })).rejects.toThrow(McpError);
  });

  it("missing Authorization header → rejected", async () => {
    const strategy = new JwtBearerAuthStrategy(SECRET);

    await expect(strategy.verify({})).rejects.toThrow(McpError);
  });

  it("fingerprint is stable for same identity claims", async () => {
    const strategy1 = new JwtBearerAuthStrategy(SECRET);
    const strategy2 = new JwtBearerAuthStrategy(SECRET);
    const token1 = await createToken({ sub: "stable-user" });
    const token2 = await createToken({ sub: "stable-user" });

    const result1 = await strategy1.verify({ authorization: `Bearer ${token1}` });
    const result2 = await strategy2.verify({ authorization: `Bearer ${token2}` });

    expect(result1.credentialFingerprint).toBe(result2.credentialFingerprint);
  });

  it("fingerprint differs for different identities", async () => {
    const strategy1 = new JwtBearerAuthStrategy(SECRET);
    const strategy2 = new JwtBearerAuthStrategy(SECRET);
    const token1 = await createToken({ sub: "user-one" });
    const token2 = await createToken({ sub: "user-two" });

    const result1 = await strategy1.verify({ authorization: `Bearer ${token1}` });
    const result2 = await strategy2.verify({ authorization: `Bearer ${token2}` });

    expect(result1.credentialFingerprint).not.toBe(result2.credentialFingerprint);
  });

  it("getCredentialFingerprint rejects expired JWTs", async () => {
    const strategy = new JwtBearerAuthStrategy(SECRET);
    const expiredTime = Math.floor(Date.now() / 1000) - 3600;
    const token = await createToken({ exp: expiredTime });

    await expect(
      strategy.getCredentialFingerprint({ authorization: `Bearer ${token}` })
    ).rejects.toThrow(McpError);
  });

  it("getCredentialFingerprint rejects invalid signature", async () => {
    const strategy = new JwtBearerAuthStrategy(SECRET);
    const token = await createToken({ secret: "wrong-secret-different-key-here" });

    await expect(
      strategy.getCredentialFingerprint({ authorization: `Bearer ${token}` })
    ).rejects.toThrow(McpError);
  });
});
