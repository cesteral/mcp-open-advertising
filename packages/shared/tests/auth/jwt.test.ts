import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { extractBearerToken, createJwt, verifyJwt, getJwtCredentialFingerprint } from "../../src/auth/jwt.js";
import { McpError } from "../../src/utils/mcp-errors.js";

// ---------------------------------------------------------------------------
// Environment setup
// ---------------------------------------------------------------------------

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.JWT_ISSUER = "test-issuer";
  process.env.MCP_RESOURCE_URI = "test-audience";
});

afterEach(() => {
  process.env.JWT_ISSUER = ORIGINAL_ENV.JWT_ISSUER;
  process.env.MCP_RESOURCE_URI = ORIGINAL_ENV.MCP_RESOURCE_URI;
});

// ---------------------------------------------------------------------------
// extractBearerToken
// ---------------------------------------------------------------------------

describe("extractBearerToken", () => {
  it('extracts token from "Bearer <token>" format', () => {
    const token = extractBearerToken("Bearer abc123");
    expect(token).toBe("abc123");
  });

  it("throws McpError when header is missing", () => {
    expect(() => extractBearerToken(undefined)).toThrow(McpError);
    expect(() => extractBearerToken(undefined)).toThrow(
      /Missing Authorization header/
    );
  });

  it('throws McpError for invalid format (no "Bearer" prefix)', () => {
    expect(() => extractBearerToken("Token abc123")).toThrow(McpError);
    expect(() => extractBearerToken("Token abc123")).toThrow(
      /Invalid Authorization header format/
    );
  });

  it('throws McpError for "Basic" auth type', () => {
    expect(() => extractBearerToken("Basic dXNlcjpwYXNz")).toThrow(
      McpError
    );
    expect(() => extractBearerToken("Basic dXNlcjpwYXNz")).toThrow(
      /Invalid Authorization header format/
    );
  });

  it("throws McpError for token with extra spaces", () => {
    // "Bearer tok en" splits into 3 parts
    expect(() => extractBearerToken("Bearer tok en")).toThrow(
      McpError
    );
  });
});

// ---------------------------------------------------------------------------
// createJwt
// ---------------------------------------------------------------------------

describe("createJwt", () => {
  const SECRET = "test-secret-key-for-jwt";

  it("creates a valid JWT that can be verified", async () => {
    const token = await createJwt("user-1", SECRET);
    expect(typeof token).toBe("string");

    // Should have three dot-separated segments (header.payload.signature)
    const parts = token.split(".");
    expect(parts).toHaveLength(3);

    // Should be verifiable
    const payload = await verifyJwt(token, SECRET);
    expect(payload.sub).toBe("user-1");
  });

  it("uses HS256 algorithm", async () => {
    const token = await createJwt("user-1", SECRET);

    // Decode the header to verify algorithm
    const headerBase64 = token.split(".")[0];
    const header = JSON.parse(
      Buffer.from(headerBase64, "base64url").toString()
    );
    expect(header.alg).toBe("HS256");
  });

  it("sets the configured issuer and audience", async () => {
    const token = await createJwt("user-1", SECRET);
    const payload = await verifyJwt(token, SECRET);
    expect(payload.iss).toBe("test-issuer");
    expect(payload.aud).toBe("test-audience");
  });

  it("defaults to 24h expiration", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await createJwt("user-1", SECRET);
    const after = Math.floor(Date.now() / 1000);

    const payload = await verifyJwt(token, SECRET);

    // exp should be ~24h (86400s) from iat
    const expectedMinExp = before + 86400;
    const expectedMaxExp = after + 86400;

    expect(payload.exp).toBeGreaterThanOrEqual(expectedMinExp);
    expect(payload.exp).toBeLessThanOrEqual(expectedMaxExp);
  });
});

// ---------------------------------------------------------------------------
// verifyJwt
// ---------------------------------------------------------------------------

describe("verifyJwt", () => {
  const SECRET = "verify-test-secret";

  it("verifies and decodes a valid JWT", async () => {
    const token = await createJwt("user-42", SECRET);
    const payload = await verifyJwt(token, SECRET);

    expect(payload.sub).toBe("user-42");
    expect(payload.iss).toBe("test-issuer");
    expect(payload.aud).toBe("test-audience");
  });

  it("returns payload with sub, iss, aud, exp, iat", async () => {
    const token = await createJwt("user-1", SECRET);
    const payload = await verifyJwt(token, SECRET);

    expect(payload).toHaveProperty("sub");
    expect(payload).toHaveProperty("iss");
    expect(payload).toHaveProperty("aud");
    expect(payload).toHaveProperty("exp");
    expect(payload).toHaveProperty("iat");
  });

  it("preserves optional allowed_advertisers claim", async () => {
    const secretKey = new TextEncoder().encode(SECRET);
    const token = await new (await import("jose")).SignJWT({
      sub: "user-1",
      allowed_advertisers: ["adv123", "adv456"],
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer("test-issuer")
      .setAudience("test-audience")
      .setExpirationTime("1h")
      .sign(secretKey);

    const payload = await verifyJwt(token, SECRET);
    expect(payload.allowed_advertisers).toEqual(["adv123", "adv456"]);
  });

  it("throws McpError for expired token", async () => {
    // Create a token that expires in 1 second
    const token = await createJwt("user-1", SECRET, "1s");

    // Wait for the token to expire
    await new Promise((resolve) => setTimeout(resolve, 1500));

    await expect(verifyJwt(token, SECRET)).rejects.toThrow(McpError);
    await expect(verifyJwt(token, SECRET)).rejects.toThrow(/expired/);
  });

  it("throws McpError for invalid signature (wrong secret)", async () => {
    const token = await createJwt("user-1", SECRET);

    await expect(verifyJwt(token, "wrong-secret")).rejects.toThrow(
      McpError
    );
    await expect(verifyJwt(token, "wrong-secret")).rejects.toThrow(
      /verification failed/
    );
  });

  it("throws McpError for tampered payload", async () => {
    const token = await createJwt("user-1", SECRET);

    // Tamper with the payload segment
    const parts = token.split(".");
    const payloadJson = JSON.parse(
      Buffer.from(parts[1], "base64url").toString()
    );
    payloadJson.sub = "hacker";
    parts[1] = Buffer.from(JSON.stringify(payloadJson)).toString("base64url");
    const tampered = parts.join(".");

    await expect(verifyJwt(tampered, SECRET)).rejects.toThrow(
      McpError
    );
  });
});

// ---------------------------------------------------------------------------
// getJwtCredentialFingerprint
// ---------------------------------------------------------------------------

describe("getJwtCredentialFingerprint", () => {
  it("is deterministic for issuer+subject", () => {
    const a = getJwtCredentialFingerprint({
      sub: "user-1",
      iss: "issuer-a",
      aud: "aud",
      exp: 1,
      iat: 1,
    });
    const b = getJwtCredentialFingerprint({
      sub: "user-1",
      iss: "issuer-a",
      aud: "aud",
      exp: 2,
      iat: 2,
    });
    const c = getJwtCredentialFingerprint({
      sub: "user-2",
      iss: "issuer-a",
      aud: "aud",
      exp: 2,
      iat: 2,
    });

    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

// ---------------------------------------------------------------------------
// Round-trip tests
// ---------------------------------------------------------------------------

describe("Round-trip (createJwt -> verifyJwt)", () => {
  it("created JWT can be verified with same secret", async () => {
    const secret = "round-trip-secret";
    const token = await createJwt("user-rt", secret);
    const payload = await verifyJwt(token, secret);

    expect(payload.sub).toBe("user-rt");
    expect(payload.iss).toBe("test-issuer");
    expect(payload.aud).toBe("test-audience");
  });

  it("created JWT fails verification with different secret", async () => {
    const token = await createJwt("user-rt", "secret-A");

    await expect(verifyJwt(token, "secret-B")).rejects.toThrow(
      McpError
    );
  });
});
