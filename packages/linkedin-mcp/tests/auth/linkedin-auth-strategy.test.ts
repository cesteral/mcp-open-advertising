import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LinkedInBearerAuthStrategy } from "../../src/auth/linkedin-auth-strategy.js";

// Mock fetchWithTimeout from shared
vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

const mockLogger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
};
mockLogger.child.mockReturnValue(mockLogger);

describe("LinkedInBearerAuthStrategy", () => {
  beforeEach(() => {
    mockFetchWithTimeout.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("verify()", () => {
    it("returns correct AuthResult shape on valid token", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "person-abc123", vanityName: "john-doe" }),
      } as unknown as Response);

      const strategy = new LinkedInBearerAuthStrategy(
        "https://api.linkedin.com",
        "202409",
        mockLogger
      );
      const result = await strategy.verify({
        authorization: "Bearer test-linkedin-token",
      });

      expect(result.authInfo).toEqual({
        clientId: "person-abc123",
        subject: "person-abc123",
        authType: "linkedin-bearer",
      });
      expect(result.platformAuthAdapter).toBeDefined();
      expect(result.credentialFingerprint).toBeDefined();
      expect(result.credentialFingerprint).toHaveLength(32);
      expect(result.credentialFingerprint).toMatch(/^[0-9a-f]{32}$/);
    });

    it("throws on invalid token (401 response)", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Invalid access token",
      } as unknown as Response);

      const strategy = new LinkedInBearerAuthStrategy(
        "https://api.linkedin.com",
        "202409",
        mockLogger
      );
      await expect(
        strategy.verify({ authorization: "Bearer bad-token" })
      ).rejects.toThrow("LinkedIn token validation failed");
    });

    it("throws when Authorization header is missing", async () => {
      const strategy = new LinkedInBearerAuthStrategy(
        "https://api.linkedin.com",
        "202409",
        mockLogger
      );
      await expect(strategy.verify({})).rejects.toThrow(
        "Missing required Authorization header"
      );
    });

    it("throws when Authorization header uses wrong scheme", async () => {
      const strategy = new LinkedInBearerAuthStrategy(
        "https://api.linkedin.com",
        "202409",
        mockLogger
      );
      await expect(
        strategy.verify({ authorization: "Basic dXNlcjpwYXNz" })
      ).rejects.toThrow("Authorization header must use Bearer scheme");
    });
  });

  describe("verify() with refresh token credentials", () => {
    it("prefers refresh token flow when X-LinkedIn-Client-Id/Secret/Refresh-Token headers are present", async () => {
      // First call: token exchange (getAccessToken)
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "li-refreshed-token",
          expires_in: 5184000,
          refresh_token: "li-new-refresh",
        }),
      } as unknown as Response);
      // Second call: /v2/me validation
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "person-refresh-123", vanityName: "refreshed" }),
      } as unknown as Response);

      const strategy = new LinkedInBearerAuthStrategy(
        "https://api.linkedin.com",
        "202409",
        mockLogger
      );
      const result = await strategy.verify({
        authorization: "Bearer ignored-static-token",
        "x-linkedin-client-id": "client-abc",
        "x-linkedin-client-secret": "secret-xyz",
        "x-linkedin-refresh-token": "refresh-123",
      });

      expect(result.authInfo).toEqual({
        clientId: "person-refresh-123",
        subject: "person-refresh-123",
        authType: "linkedin-bearer",
      });
      expect(result.platformAuthAdapter).toBeDefined();
      expect(result.credentialFingerprint).toBeDefined();
      expect(result.credentialFingerprint).toHaveLength(32);

      // 2 fetch calls: token exchange + /v2/me
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });

    it("uses stable fingerprint based on clientId (not rotating token)", async () => {
      // Token exchange
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "token-a", expires_in: 5184000 }),
      } as unknown as Response);
      // /v2/me
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "person-1" }),
      } as unknown as Response);

      const strategy = new LinkedInBearerAuthStrategy(
        "https://api.linkedin.com",
        "202409",
        mockLogger
      );
      const result = await strategy.verify({
        authorization: "Bearer any",
        "x-linkedin-client-id": "stable-client-id",
        "x-linkedin-client-secret": "secret",
        "x-linkedin-refresh-token": "refresh",
      });

      // Fingerprint should be based on clientId, not rotating access token
      const fpFromStrategy = await strategy.getCredentialFingerprint({
        authorization: "Bearer different-token",
        "x-linkedin-client-id": "stable-client-id",
        "x-linkedin-client-secret": "secret",
        "x-linkedin-refresh-token": "refresh",
      });
      expect(result.credentialFingerprint).toBe(fpFromStrategy);
    });

    it("falls back to static token when refresh credentials are incomplete", async () => {
      // Only client-id provided, missing secret + refresh — falls back to static
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "person-static", vanityName: "static" }),
      } as unknown as Response);

      const strategy = new LinkedInBearerAuthStrategy(
        "https://api.linkedin.com",
        "202409",
        mockLogger
      );
      const result = await strategy.verify({
        authorization: "Bearer static-token",
        "x-linkedin-client-id": "client-abc",
        // Missing client-secret and refresh-token
      });

      expect(result.authInfo.clientId).toBe("person-static");
      // Only 1 fetch (/v2/me for static token)
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });
  });

  describe("getCredentialFingerprint()", () => {
    it("returns fingerprint without making a network call", async () => {
      const strategy = new LinkedInBearerAuthStrategy(
        "https://api.linkedin.com",
        "202409",
        mockLogger
      );
      const fingerprint = await strategy.getCredentialFingerprint({
        authorization: "Bearer test-linkedin-token-for-fingerprint",
      });

      expect(fingerprint).toBeDefined();
      expect(fingerprint).toHaveLength(32);
      expect(fingerprint).toMatch(/^[0-9a-f]{32}$/);

      // No network call should have been made
      expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    });

    it("returns consistent fingerprint for same token", async () => {
      const strategy = new LinkedInBearerAuthStrategy(
        "https://api.linkedin.com",
        "202409",
        mockLogger
      );
      const fp1 = await strategy.getCredentialFingerprint({
        authorization: "Bearer same-token-value",
      });
      const fp2 = await strategy.getCredentialFingerprint({
        authorization: "Bearer same-token-value",
      });
      expect(fp1).toBe(fp2);
    });

    it("returns different fingerprints for different tokens", async () => {
      const strategy = new LinkedInBearerAuthStrategy(
        "https://api.linkedin.com",
        "202409",
        mockLogger
      );
      const fp1 = await strategy.getCredentialFingerprint({
        authorization: "Bearer token-aaa",
      });
      const fp2 = await strategy.getCredentialFingerprint({
        authorization: "Bearer token-bbb",
      });
      expect(fp1).not.toBe(fp2);
    });
  });
});
