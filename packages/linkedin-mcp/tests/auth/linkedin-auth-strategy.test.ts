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
      expect(result.credentialFingerprint).toHaveLength(16);
      expect(result.credentialFingerprint).toMatch(/^[0-9a-f]{16}$/);
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
      expect(fingerprint).toHaveLength(16);
      expect(fingerprint).toMatch(/^[0-9a-f]{16}$/);

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
