import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockParseSA360CredentialsFromHeaders = vi.fn();
const mockGetSA360CredentialFingerprint = vi.fn();
const mockGetAccessToken = vi.fn();

vi.mock("../../src/auth/sa360-auth-adapter.js", () => ({
  parseSA360CredentialsFromHeaders: (...args: unknown[]) =>
    mockParseSA360CredentialsFromHeaders(...args),
  getSA360CredentialFingerprint: (...args: unknown[]) =>
    mockGetSA360CredentialFingerprint(...args),
  SA360RefreshTokenAuthAdapter: vi.fn().mockImplementation(() => ({
    getAccessToken: mockGetAccessToken,
  })),
}));

import { SA360HeadersAuthStrategy } from "../../src/auth/sa360-auth-strategy.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: "debug",
  } as any;
}

const VALID_HEADERS: Record<string, string> = {
  "x-sa360-client-id": "test-client-id",
  "x-sa360-client-secret": "test-client-secret",
  "x-sa360-refresh-token": "test-refresh-token",
};

const PARSED_CREDENTIALS = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  refreshToken: "test-refresh-token",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SA360HeadersAuthStrategy", () => {
  let strategy: SA360HeadersAuthStrategy;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    strategy = new SA360HeadersAuthStrategy(logger);

    // Default mock behaviour for happy path
    mockParseSA360CredentialsFromHeaders.mockReturnValue(PARSED_CREDENTIALS);
    mockGetAccessToken.mockResolvedValue("access-token-123");
    mockGetSA360CredentialFingerprint.mockReturnValue("abcd1234abcd1234abcd1234abcd1234");
  });

  // -------------------------------------------------------------------------
  // verify()
  // -------------------------------------------------------------------------

  describe("verify()", () => {
    it("returns correct AuthResult shape with authInfo containing clientId and authType", async () => {
      const result = await strategy.verify(VALID_HEADERS);

      expect(result.authInfo).toEqual({
        clientId: "test-client-id",
        authType: "sa360-headers",
      });
    });

    it("calls adapter.getAccessToken() to validate credentials", async () => {
      await strategy.verify(VALID_HEADERS);

      expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    });

    it("returns platformAuthAdapter (the adapter instance)", async () => {
      const result = await strategy.verify(VALID_HEADERS);

      expect(result.platformAuthAdapter).toBeDefined();
      expect(result.platformAuthAdapter).toHaveProperty("getAccessToken");
    });

    it("returns credentialFingerprint from getSA360CredentialFingerprint", async () => {
      const result = await strategy.verify(VALID_HEADERS);

      expect(result.credentialFingerprint).toBe("abcd1234abcd1234abcd1234abcd1234");
      expect(mockGetSA360CredentialFingerprint).toHaveBeenCalledWith(PARSED_CREDENTIALS);
    });

    it("throws when getAccessToken() rejects (invalid credentials)", async () => {
      mockGetAccessToken.mockRejectedValue(
        new Error("Google OAuth2 token exchange failed: 401 Unauthorized")
      );

      await expect(strategy.verify(VALID_HEADERS)).rejects.toThrow(
        "Google OAuth2 token exchange failed: 401 Unauthorized"
      );
    });

    it("throws when parseSA360CredentialsFromHeaders throws (missing headers)", async () => {
      mockParseSA360CredentialsFromHeaders.mockImplementation(() => {
        throw new Error("Missing required header: X-SA360-Client-Id");
      });

      await expect(strategy.verify({})).rejects.toThrow(
        "Missing required header: X-SA360-Client-Id"
      );
    });
  });

  // -------------------------------------------------------------------------
  // getCredentialFingerprint()
  // -------------------------------------------------------------------------

  describe("getCredentialFingerprint()", () => {
    it("returns fingerprint without calling getAccessToken (no validation)", async () => {
      const fingerprint = await strategy.getCredentialFingerprint(VALID_HEADERS);

      expect(fingerprint).toBe("abcd1234abcd1234abcd1234abcd1234");
      expect(mockGetAccessToken).not.toHaveBeenCalled();
    });

    it("returns consistent fingerprint for same headers", async () => {
      const fp1 = await strategy.getCredentialFingerprint(VALID_HEADERS);
      const fp2 = await strategy.getCredentialFingerprint(VALID_HEADERS);

      expect(fp1).toBe(fp2);
    });
  });
});
