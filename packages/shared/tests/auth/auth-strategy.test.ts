import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  NoAuthStrategy,
  GoogleHeadersAuthStrategy,
  JwtBearerAuthStrategy,
  createAuthStrategy,
} from "../../src/auth/auth-strategy.js";

// ---------------------------------------------------------------------------
// Mock the dynamic imports used by the strategies
// ---------------------------------------------------------------------------

vi.mock("../../src/auth/google-auth.js", () => ({
  parseCredentialsFromHeaders: vi.fn(),
  createGoogleAuthAdapter: vi.fn(),
  getCredentialFingerprint: vi.fn(),
}));

vi.mock("../../src/auth/jwt.js", () => ({
  extractBearerToken: vi.fn(),
  verifyJwt: vi.fn(),
  decodeJwtPayload: vi.fn(),
  getJwtCredentialFingerprint: vi.fn(),
}));

// We need to import the mocked modules so we can control their return values
import {
  parseCredentialsFromHeaders,
  createGoogleAuthAdapter,
  getCredentialFingerprint,
} from "../../src/auth/google-auth.js";

import { extractBearerToken, verifyJwt, decodeJwtPayload, getJwtCredentialFingerprint } from "../../src/auth/jwt.js";

// Cast to vi.Mock for easier typing
const mockParseCredentials = parseCredentialsFromHeaders as ReturnType<typeof vi.fn>;
const mockCreateAdapter = createGoogleAuthAdapter as ReturnType<typeof vi.fn>;
const mockGetFingerprint = getCredentialFingerprint as ReturnType<typeof vi.fn>;
const mockExtractBearer = extractBearerToken as ReturnType<typeof vi.fn>;
const mockVerifyJwt = verifyJwt as ReturnType<typeof vi.fn>;
const mockDecodeJwtPayload = decodeJwtPayload as ReturnType<typeof vi.fn>;
const mockGetJwtFingerprint = getJwtCredentialFingerprint as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("NoAuthStrategy", () => {
  it("returns anonymous auth info", async () => {
    const strategy = new NoAuthStrategy();
    const result = await strategy.verify({});
    expect(result.authInfo.clientId).toBe("anonymous");
    expect(result.authInfo.authType).toBe("none");
  });

  it("clientId is 'anonymous'", async () => {
    const strategy = new NoAuthStrategy();
    const result = await strategy.verify({});
    expect(result.authInfo.clientId).toBe("anonymous");
  });

  it("authType is 'none'", async () => {
    const strategy = new NoAuthStrategy();
    const result = await strategy.verify({});
    expect(result.authInfo.authType).toBe("none");
  });

  it("getCredentialFingerprint returns undefined", async () => {
    const strategy = new NoAuthStrategy();
    await expect(strategy.getCredentialFingerprint?.({})).resolves.toBeUndefined();
  });
});

describe("GoogleHeadersAuthStrategy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls parseCredentialsFromHeaders and createGoogleAuthAdapter", async () => {
    const mockAdapter = {
      getAccessToken: vi.fn().mockResolvedValue("tok"),
      credentialType: "service_account",
      scopes: ["scope1"],
    };
    mockParseCredentials.mockReturnValue({
      type: "service_account",
      client_email: "sa@test.iam.gserviceaccount.com",
    });
    mockCreateAdapter.mockReturnValue(mockAdapter);
    mockGetFingerprint.mockReturnValue("fp-abc");

    const strategy = new GoogleHeadersAuthStrategy(["scope1"]);
    await strategy.verify({ "x-google-auth-type": "service_account" });

    expect(mockParseCredentials).toHaveBeenCalledOnce();
    expect(mockCreateAdapter).toHaveBeenCalledOnce();
  });

  it("returns googleAuthAdapter in result", async () => {
    const mockAdapter = {
      getAccessToken: vi.fn().mockResolvedValue("tok"),
      credentialType: "service_account",
      scopes: ["scope1"],
    };
    mockParseCredentials.mockReturnValue({
      type: "service_account",
      client_email: "sa@test.iam.gserviceaccount.com",
    });
    mockCreateAdapter.mockReturnValue(mockAdapter);
    mockGetFingerprint.mockReturnValue("fp-abc");

    const strategy = new GoogleHeadersAuthStrategy(["scope1"]);
    const result = await strategy.verify({});

    expect(result.googleAuthAdapter).toBe(mockAdapter);
  });

  it("returns credentialFingerprint", async () => {
    const mockAdapter = {
      getAccessToken: vi.fn().mockResolvedValue("tok"),
      credentialType: "oauth2",
      scopes: ["scope1"],
    };
    mockParseCredentials.mockReturnValue({
      type: "oauth2",
      clientId: "client-123",
    });
    mockCreateAdapter.mockReturnValue(mockAdapter);
    mockGetFingerprint.mockReturnValue("fp-xyz");

    const strategy = new GoogleHeadersAuthStrategy(["scope1"]);
    const result = await strategy.verify({});

    expect(result.credentialFingerprint).toBe("fp-xyz");
  });

  it("validates by calling getAccessToken", async () => {
    const mockGetAccessToken = vi.fn().mockResolvedValue("tok");
    const mockAdapter = {
      getAccessToken: mockGetAccessToken,
      credentialType: "service_account",
      scopes: ["scope1"],
    };
    mockParseCredentials.mockReturnValue({
      type: "service_account",
      client_email: "sa@test.iam.gserviceaccount.com",
    });
    mockCreateAdapter.mockReturnValue(mockAdapter);
    mockGetFingerprint.mockReturnValue("fp-abc");

    const strategy = new GoogleHeadersAuthStrategy(["scope1"]);
    await strategy.verify({});

    expect(mockGetAccessToken).toHaveBeenCalledOnce();
  });

  it("extracts fingerprint without adapter creation in getCredentialFingerprint", async () => {
    mockParseCredentials.mockReturnValue({
      type: "oauth2",
      clientId: "client-123",
      clientSecret: "secret",
      refreshToken: "refresh",
    });
    mockGetFingerprint.mockReturnValue("fp-only");

    const strategy = new GoogleHeadersAuthStrategy(["scope1"]);
    const fp = await strategy.getCredentialFingerprint?.({ "x-google-auth-type": "oauth2" });

    expect(fp).toBe("fp-only");
    expect(mockCreateAdapter).not.toHaveBeenCalled();
  });

  it("throws when headers are invalid (propagates parseCredentialsFromHeaders errors)", async () => {
    mockParseCredentials.mockImplementation(() => {
      throw new Error("Missing X-Google-Auth-Type header.");
    });

    const strategy = new GoogleHeadersAuthStrategy(["scope1"]);
    await expect(strategy.verify({})).rejects.toThrow(
      /Missing X-Google-Auth-Type header/
    );
  });
});

describe("JwtBearerAuthStrategy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts bearer token from Authorization header", async () => {
    mockExtractBearer.mockReturnValue("my-jwt-token");
    mockVerifyJwt.mockResolvedValue({
      sub: "user-1",
      iss: "cesteral-mcp",
      aud: "cesteral-services",
      exp: 9999999999,
      iat: 1000000000,
    });
    mockGetJwtFingerprint.mockReturnValue("fp-jwt");

    const strategy = new JwtBearerAuthStrategy("my-secret");
    await strategy.verify({ authorization: "Bearer my-jwt-token" });

    expect(mockExtractBearer).toHaveBeenCalledWith("Bearer my-jwt-token");
  });

  it("verifies JWT with the configured secret", async () => {
    mockExtractBearer.mockReturnValue("my-jwt-token");
    mockVerifyJwt.mockResolvedValue({
      sub: "user-1",
      iss: "cesteral-mcp",
      aud: "cesteral-services",
      exp: 9999999999,
      iat: 1000000000,
    });
    mockGetJwtFingerprint.mockReturnValue("fp-jwt");

    const strategy = new JwtBearerAuthStrategy("my-secret");
    await strategy.verify({ authorization: "Bearer my-jwt-token" });

    expect(mockVerifyJwt).toHaveBeenCalledWith("my-jwt-token", "my-secret");
  });

  it("returns authInfo with subject from JWT payload", async () => {
    mockExtractBearer.mockReturnValue("tok");
    mockVerifyJwt.mockResolvedValue({
      sub: "user-42",
      iss: "cesteral-mcp",
      aud: "cesteral-services",
      exp: 9999999999,
      iat: 1000000000,
      scope: "read write",
      allowed_advertisers: ["adv123"],
    });
    mockGetJwtFingerprint.mockReturnValue("fp-jwt-42");

    const strategy = new JwtBearerAuthStrategy("secret");
    const result = await strategy.verify({ authorization: "Bearer tok" });

    expect(result.authInfo.clientId).toBe("user-42");
    expect(result.authInfo.subject).toBe("user-42");
    expect(result.authInfo.authType).toBe("jwt");
    expect(result.authInfo.scopes).toEqual(["read", "write"]);
    expect(result.allowedAdvertisers).toEqual(["adv123"]);
    expect(result.credentialFingerprint).toBe("fp-jwt-42");
  });

  it("handles array Authorization header (takes first value)", async () => {
    mockExtractBearer.mockReturnValue("first-token");
    mockVerifyJwt.mockResolvedValue({
      sub: "user-1",
      iss: "cesteral-mcp",
      aud: "cesteral-services",
      exp: 9999999999,
      iat: 1000000000,
    });
    mockGetJwtFingerprint.mockReturnValue("fp-jwt");

    const strategy = new JwtBearerAuthStrategy("secret");
    await strategy.verify({
      authorization: ["Bearer first-token", "Bearer second-token"],
    });

    expect(mockExtractBearer).toHaveBeenCalledWith("Bearer first-token");
  });

  it("extracts fingerprint via getCredentialFingerprint (lightweight decode)", async () => {
    mockExtractBearer.mockReturnValue("tok");
    mockDecodeJwtPayload.mockReturnValue({
      sub: "user-1",
      iss: "issuer",
      aud: "aud",
      exp: 9999999999,
      iat: 1000000000,
    });
    mockGetJwtFingerprint.mockReturnValue("fp-derived");

    const strategy = new JwtBearerAuthStrategy("secret");
    const fp = await strategy.getCredentialFingerprint?.({ authorization: "Bearer tok" });

    expect(fp).toBe("fp-derived");
    expect(mockGetJwtFingerprint).toHaveBeenCalled();
    // Should use lightweight decode, NOT full verifyJwt
    expect(mockDecodeJwtPayload).toHaveBeenCalledWith("tok");
    expect(mockVerifyJwt).not.toHaveBeenCalled();
  });

  it("throws when Authorization header is missing", async () => {
    mockExtractBearer.mockImplementation(() => {
      throw new Error("Missing Authorization header");
    });

    const strategy = new JwtBearerAuthStrategy("secret");
    await expect(strategy.verify({})).rejects.toThrow(
      /Missing Authorization header/
    );
  });
});

describe("createAuthStrategy", () => {
  it('returns GoogleHeadersAuthStrategy for "google-headers" mode', () => {
    const strategy = createAuthStrategy("google-headers", { scopes: ["s1"] });
    expect(strategy).toBeInstanceOf(GoogleHeadersAuthStrategy);
  });

  it('returns JwtBearerAuthStrategy for "jwt" mode', () => {
    const strategy = createAuthStrategy("jwt", { jwtSecret: "test-secret" });
    expect(strategy).toBeInstanceOf(JwtBearerAuthStrategy);
  });

  it('returns NoAuthStrategy for "none" mode', () => {
    const strategy = createAuthStrategy("none");
    expect(strategy).toBeInstanceOf(NoAuthStrategy);
  });

  it("throws when jwt mode is used without secret", () => {
    expect(() => createAuthStrategy("jwt")).toThrow(
      /MCP_AUTH_SECRET_KEY is required for jwt auth mode/
    );
  });

  it("throws on unknown auth mode", () => {
    // @ts-expect-error testing unknown mode
    expect(() => createAuthStrategy("magic")).toThrow(/Unknown auth mode: magic/);
  });
});
