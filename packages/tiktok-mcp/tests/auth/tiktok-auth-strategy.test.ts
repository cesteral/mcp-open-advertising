import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TikTokBearerAuthStrategy } from "../../src/auth/tiktok-auth-strategy.js";

// Mock fetchWithTimeout from shared
vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  const extractHeader = (
    headers: Record<string, string | string[] | undefined>,
    name: string
  ): string | undefined => {
    const key = Object.keys(headers).find(
      (candidate) => candidate.toLowerCase() === name.toLowerCase()
    );
    const value = key ? headers[key] : undefined;
    return Array.isArray(value) ? value[0] : value;
  };
  return { ...actual, extractHeader, fetchWithTimeout: vi.fn() };
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

describe("TikTokBearerAuthStrategy", () => {
  beforeEach(() => {
    mockFetchWithTimeout.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("verify()", () => {
    it("returns correct AuthResult shape when both headers are present", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          message: "OK",
          data: { display_name: "Test Advertiser", email: "test@example.com" },
        }),
      } as unknown as Response);

      const strategy = new TikTokBearerAuthStrategy("https://business-api.tiktok.com", mockLogger);
      const result = await strategy.verify({
        authorization: "Bearer test-tiktok-token",
        "x-tiktok-advertiser-id": "1234567890",
      });

      expect(result.authInfo).toMatchObject({
        authType: "tiktok-bearer",
      });
      expect(result.platformAuthAdapter).toBeDefined();
      expect(result.credentialFingerprint).toBeDefined();
      expect(result.credentialFingerprint).toHaveLength(32);
      expect(result.credentialFingerprint).toMatch(/^[0-9a-f]{32}$/);
    });

    it("throws when Authorization header is missing", async () => {
      const strategy = new TikTokBearerAuthStrategy("https://business-api.tiktok.com", mockLogger);
      await expect(strategy.verify({ "x-tiktok-advertiser-id": "1234567890" })).rejects.toThrow(
        "Missing required Authorization header"
      );
    });

    it("throws when X-TikTok-Advertiser-Id header is missing", async () => {
      const strategy = new TikTokBearerAuthStrategy("https://business-api.tiktok.com", mockLogger);
      await expect(strategy.verify({ authorization: "Bearer test-token" })).rejects.toThrow(
        "Missing required X-TikTok-Advertiser-Id header"
      );
    });

    it("throws on invalid token (TikTok code != 0)", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 40001,
          message: "Access token expired",
          data: null,
        }),
      } as unknown as Response);

      const strategy = new TikTokBearerAuthStrategy("https://business-api.tiktok.com", mockLogger);
      await expect(
        strategy.verify({
          authorization: "Bearer bad-token",
          "x-tiktok-advertiser-id": "1234567890",
        })
      ).rejects.toThrow("TikTok token validation failed");
    });

    it("throws on HTTP error during validation", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Unauthorized",
      } as unknown as Response);

      const strategy = new TikTokBearerAuthStrategy("https://business-api.tiktok.com", mockLogger);
      await expect(
        strategy.verify({
          authorization: "Bearer bad-token",
          "x-tiktok-advertiser-id": "1234567890",
        })
      ).rejects.toThrow("TikTok token validation HTTP error");
    });
  });

  describe("verify() with refresh token credentials", () => {
    it("rejects X-TikTok-App-Id/Secret/Refresh-Token headers with a clear Unauthorized error", async () => {
      // TikTok documents no refresh endpoint: oauth2/access_token/ only takes
      // { app_id, secret, auth_code }. The strategy must fail at session
      // establishment with an actionable message and make no upstream call.
      const strategy = new TikTokBearerAuthStrategy("https://business-api.tiktok.com", mockLogger);
      await expect(
        strategy.verify({
          authorization: "Bearer ignored-static-token",
          "x-tiktok-advertiser-id": "1234567890",
          "x-tiktok-app-id": "app-123",
          "x-tiktok-app-secret": "secret-456",
          "x-tiktok-refresh-token": "refresh-789",
        })
      ).rejects.toMatchObject({
        code: -32006,
        message: expect.stringContaining("refresh-token authentication is not supported"),
      });
      expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    });

    it("falls back to static token when refresh credentials are incomplete", async () => {
      // Only app-id provided, no secret or refresh token — should fall back to static
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          message: "OK",
          data: { display_name: "Static User" },
        }),
      } as unknown as Response);

      const strategy = new TikTokBearerAuthStrategy("https://business-api.tiktok.com", mockLogger);
      const result = await strategy.verify({
        authorization: "Bearer static-token",
        "x-tiktok-advertiser-id": "1234567890",
        "x-tiktok-app-id": "app-123",
        // Missing app-secret and refresh-token
      });

      expect(result.authInfo.clientId).toBe("Static User");
      // Only 1 fetch (user info validation for static token)
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });
  });

  describe("getCredentialFingerprint()", () => {
    it("returns fingerprint without network call", async () => {
      const strategy = new TikTokBearerAuthStrategy("https://business-api.tiktok.com", mockLogger);
      const fingerprint = await strategy.getCredentialFingerprint({
        authorization: "Bearer test-tiktok-token",
        "x-tiktok-advertiser-id": "1234567890",
      });

      expect(fingerprint).toBeDefined();
      expect(fingerprint).toHaveLength(32);
      expect(fingerprint).toMatch(/^[0-9a-f]{32}$/);

      // No network call should have been made
      expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    });

    it("returns consistent fingerprint for same token + advertiser ID", async () => {
      const strategy = new TikTokBearerAuthStrategy("https://business-api.tiktok.com", mockLogger);
      const fp1 = await strategy.getCredentialFingerprint({
        authorization: "Bearer same-token",
        "x-tiktok-advertiser-id": "1234567890",
      });
      const fp2 = await strategy.getCredentialFingerprint({
        authorization: "Bearer same-token",
        "x-tiktok-advertiser-id": "1234567890",
      });
      expect(fp1).toBe(fp2);
    });

    it("returns different fingerprints for different advertiser IDs", async () => {
      const strategy = new TikTokBearerAuthStrategy("https://business-api.tiktok.com", mockLogger);
      const fp1 = await strategy.getCredentialFingerprint({
        authorization: "Bearer same-token",
        "x-tiktok-advertiser-id": "1111111111",
      });
      const fp2 = await strategy.getCredentialFingerprint({
        authorization: "Bearer same-token",
        "x-tiktok-advertiser-id": "2222222222",
      });
      expect(fp1).not.toBe(fp2);
    });
  });
});
