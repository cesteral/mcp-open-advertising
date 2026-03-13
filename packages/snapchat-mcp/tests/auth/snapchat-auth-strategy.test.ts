import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SnapchatBearerAuthStrategy } from "../../src/auth/snapchat-auth-strategy.js";

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

describe("SnapchatBearerAuthStrategy", () => {
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
          request_status: "SUCCESS",
          me: { id: "snap_user_123", display_name: "Test Advertiser", email: "test@example.com" },
        }),
      } as unknown as Response);

      const strategy = new SnapchatBearerAuthStrategy(
        "https://adsapi.snapchat.com",
        mockLogger
      );
      const result = await strategy.verify({
        authorization: "Bearer test-snapchat-token",
        "x-snapchat-advertiser-id": "1234567890",
      });

      expect(result.authInfo).toMatchObject({
        authType: "snapchat-bearer",
      });
      expect(result.platformAuthAdapter).toBeDefined();
      expect(result.credentialFingerprint).toBeDefined();
      expect(result.credentialFingerprint).toHaveLength(32);
      expect(result.credentialFingerprint).toMatch(/^[0-9a-f]{32}$/);
    });

    it("throws when Authorization header is missing", async () => {
      const strategy = new SnapchatBearerAuthStrategy(
        "https://adsapi.snapchat.com",
        mockLogger
      );
      await expect(
        strategy.verify({ "x-snapchat-advertiser-id": "1234567890" })
      ).rejects.toThrow("Missing required Authorization header");
    });

    it("throws when X-Snapchat-Advertiser-Id header is missing", async () => {
      const strategy = new SnapchatBearerAuthStrategy(
        "https://adsapi.snapchat.com",
        mockLogger
      );
      await expect(
        strategy.verify({ authorization: "Bearer test-token" })
      ).rejects.toThrow("Missing required X-Snapchat-Advertiser-Id header");
    });

    it("throws on HTTP error during validation", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Unauthorized",
      } as unknown as Response);

      const strategy = new SnapchatBearerAuthStrategy(
        "https://adsapi.snapchat.com",
        mockLogger
      );
      await expect(
        strategy.verify({
          authorization: "Bearer bad-token",
          "x-snapchat-advertiser-id": "1234567890",
        })
      ).rejects.toThrow("401");
    });
  });

  describe("verify() with refresh token credentials", () => {
    it("prefers refresh token flow when X-Snapchat-App-Id/Secret/Refresh-Token headers are present", async () => {
      // First call: token exchange (getAccessToken) — flat OAuth2 response
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "refreshed-token",
          token_type: "bearer",
          expires_in: 86400,
        }),
      } as unknown as Response);
      // Second call: user info validation — Snapchat /v1/me response
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          request_status: "SUCCESS",
          me: { id: "snap_refresh_user", display_name: "Refresh User" },
        }),
      } as unknown as Response);

      const strategy = new SnapchatBearerAuthStrategy(
        "https://adsapi.snapchat.com",
        mockLogger
      );
      const result = await strategy.verify({
        authorization: "Bearer ignored-static-token",
        "x-snapchat-advertiser-id": "1234567890",
        "x-snapchat-app-id": "app-123",
        "x-snapchat-app-secret": "secret-456",
        "x-snapchat-refresh-token": "refresh-789",
      });

      expect(result.authInfo).toMatchObject({
        clientId: "snap_refresh_user",
        authType: "snapchat-bearer",
      });
      expect(result.platformAuthAdapter).toBeDefined();
      expect(result.credentialFingerprint).toBeDefined();
      expect(result.credentialFingerprint).toHaveLength(32);

      // Should have made 2 fetch calls (token exchange + user info)
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });

    it("uses stable fingerprint based on appId (not rotating token)", async () => {
      // Token exchange — flat OAuth2
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "token-a",
          expires_in: 86400,
        }),
      } as unknown as Response);
      // User info — Snapchat /v1/me
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ request_status: "SUCCESS", me: { id: "stable_user", display_name: "User" } }),
      } as unknown as Response);

      const strategy = new SnapchatBearerAuthStrategy(
        "https://adsapi.snapchat.com",
        mockLogger
      );
      const result = await strategy.verify({
        authorization: "Bearer any-token",
        "x-snapchat-advertiser-id": "adv-1",
        "x-snapchat-app-id": "app-stable",
        "x-snapchat-app-secret": "secret",
        "x-snapchat-refresh-token": "refresh",
      });

      // Fingerprint should be based on appId + adAccountId, not the rotating access token
      const fpFromStrategy = await strategy.getCredentialFingerprint({
        authorization: "Bearer different-token",
        "x-snapchat-advertiser-id": "adv-1",
        "x-snapchat-app-id": "app-stable",
        "x-snapchat-app-secret": "secret",
        "x-snapchat-refresh-token": "refresh",
      });
      expect(result.credentialFingerprint).toBe(fpFromStrategy);
    });

    it("falls back to static token when refresh credentials are incomplete", async () => {
      // Only app-id provided, no secret or refresh token — should fall back to static
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          request_status: "SUCCESS",
          me: { id: "static_user_id", display_name: "Static User" },
        }),
      } as unknown as Response);

      const strategy = new SnapchatBearerAuthStrategy(
        "https://adsapi.snapchat.com",
        mockLogger
      );
      const result = await strategy.verify({
        authorization: "Bearer static-token",
        "x-snapchat-advertiser-id": "1234567890",
        "x-snapchat-app-id": "app-123",
        // Missing app-secret and refresh-token
      });

      expect(result.authInfo.clientId).toBe("static_user_id");
      // Only 1 fetch (user info validation for static token)
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });
  });

  describe("getCredentialFingerprint()", () => {
    it("returns fingerprint without network call", async () => {
      const strategy = new SnapchatBearerAuthStrategy(
        "https://adsapi.snapchat.com",
        mockLogger
      );
      const fingerprint = await strategy.getCredentialFingerprint({
        authorization: "Bearer test-snapchat-token",
        "x-snapchat-advertiser-id": "1234567890",
      });

      expect(fingerprint).toBeDefined();
      expect(fingerprint).toHaveLength(32);
      expect(fingerprint).toMatch(/^[0-9a-f]{32}$/);

      // No network call should have been made
      expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    });

    it("returns consistent fingerprint for same token + advertiser ID", async () => {
      const strategy = new SnapchatBearerAuthStrategy(
        "https://adsapi.snapchat.com",
        mockLogger
      );
      const fp1 = await strategy.getCredentialFingerprint({
        authorization: "Bearer same-token",
        "x-snapchat-advertiser-id": "1234567890",
      });
      const fp2 = await strategy.getCredentialFingerprint({
        authorization: "Bearer same-token",
        "x-snapchat-advertiser-id": "1234567890",
      });
      expect(fp1).toBe(fp2);
    });

    it("returns different fingerprints for different advertiser IDs", async () => {
      const strategy = new SnapchatBearerAuthStrategy(
        "https://adsapi.snapchat.com",
        mockLogger
      );
      const fp1 = await strategy.getCredentialFingerprint({
        authorization: "Bearer same-token",
        "x-snapchat-advertiser-id": "1111111111",
      });
      const fp2 = await strategy.getCredentialFingerprint({
        authorization: "Bearer same-token",
        "x-snapchat-advertiser-id": "2222222222",
      });
      expect(fp1).not.toBe(fp2);
    });
  });
});
