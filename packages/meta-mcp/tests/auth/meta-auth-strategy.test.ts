import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MetaBearerAuthStrategy } from "../../src/auth/meta-auth-strategy.js";

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

describe("MetaBearerAuthStrategy", () => {
  beforeEach(() => {
    mockFetchWithTimeout.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("verify()", () => {
    it("returns correct AuthResult shape", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "user-123", name: "Test User" }),
      } as unknown as Response);

      const strategy = new MetaBearerAuthStrategy("https://graph.test/v21.0", mockLogger);
      const result = await strategy.verify({
        authorization: "Bearer test-meta-token",
      });

      expect(result.authInfo).toEqual({
        clientId: "user-123",
        subject: "user-123",
        authType: "meta-bearer",
      });
      expect(result.platformAuthAdapter).toBeDefined();
      expect(result.credentialFingerprint).toBeDefined();
      expect(result.credentialFingerprint).toHaveLength(32);
      expect(result.credentialFingerprint).toMatch(/^[0-9a-f]{32}$/);
    });

    it("throws on invalid token", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Invalid OAuth access token",
      } as unknown as Response);

      const strategy = new MetaBearerAuthStrategy("https://graph.test/v21.0", mockLogger);
      await expect(strategy.verify({ authorization: "Bearer bad-token" })).rejects.toThrow(
        "Meta token validation failed"
      );
    });

    it("throws when Authorization header is missing", async () => {
      const strategy = new MetaBearerAuthStrategy("https://graph.test/v21.0", mockLogger);
      await expect(strategy.verify({})).rejects.toThrow("Missing required Authorization header");
    });
  });

  describe("verify() with app credentials (token exchange flow)", () => {
    it("prefers token exchange when X-Meta-App-Id and X-Meta-App-Secret headers are present", async () => {
      // First call: token exchange (POST /oauth/access_token)
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "long-lived-token",
          token_type: "bearer",
          expires_in: 5184000,
        }),
      } as unknown as Response);
      // Second call: /me validation
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "user-exchange-123", name: "Exchange User" }),
      } as unknown as Response);

      const strategy = new MetaBearerAuthStrategy("https://graph.test/v21.0", mockLogger);
      const result = await strategy.verify({
        authorization: "Bearer short-lived-token",
        "x-meta-app-id": "app-123",
        "x-meta-app-secret": "secret-456",
      });

      expect(result.authInfo).toEqual({
        clientId: "user-exchange-123",
        subject: "user-exchange-123",
        authType: "meta-bearer",
      });
      expect(result.platformAuthAdapter).toBeDefined();
      expect(result.credentialFingerprint).toBeDefined();
      expect(result.credentialFingerprint).toHaveLength(32);

      // 2 fetch calls: token exchange + /me
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });

    it("uses stable fingerprint based on appId (not rotating token)", async () => {
      // Token exchange
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "ll-token",
          token_type: "bearer",
          expires_in: 5184000,
        }),
      } as unknown as Response);
      // /me
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "user-1", name: "User" }),
      } as unknown as Response);

      const strategy = new MetaBearerAuthStrategy("https://graph.test/v21.0", mockLogger);
      const result = await strategy.verify({
        authorization: "Bearer any-token",
        "x-meta-app-id": "stable-app-id",
        "x-meta-app-secret": "secret",
      });

      // Fingerprint should be based on appId, not rotating access token
      const fpFromStrategy = await strategy.getCredentialFingerprint({
        authorization: "Bearer different-token",
        "x-meta-app-id": "stable-app-id",
        "x-meta-app-secret": "secret",
      });
      expect(result.credentialFingerprint).toBe(fpFromStrategy);
    });

    it("falls back to static token when only app-id is present (no secret)", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "user-static", name: "Static User" }),
      } as unknown as Response);

      const strategy = new MetaBearerAuthStrategy("https://graph.test/v21.0", mockLogger);
      const result = await strategy.verify({
        authorization: "Bearer static-token",
        "x-meta-app-id": "app-123",
        // Missing x-meta-app-secret
      });

      expect(result.authInfo.clientId).toBe("user-static");
      // Only 1 fetch (/me for static token)
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });
  });

  describe("getCredentialFingerprint()", () => {
    it("returns fingerprint without network call (no validate())", async () => {
      const strategy = new MetaBearerAuthStrategy("https://graph.test/v21.0", mockLogger);
      const fingerprint = await strategy.getCredentialFingerprint({
        authorization: "Bearer test-meta-token-for-fingerprint",
      });

      expect(fingerprint).toBeDefined();
      expect(fingerprint).toHaveLength(32);
      expect(fingerprint).toMatch(/^[0-9a-f]{32}$/);

      // No network call should have been made
      expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    });

    it("returns consistent fingerprint for same token", async () => {
      const strategy = new MetaBearerAuthStrategy("https://graph.test/v21.0", mockLogger);
      const fp1 = await strategy.getCredentialFingerprint({
        authorization: "Bearer same-token",
      });
      const fp2 = await strategy.getCredentialFingerprint({
        authorization: "Bearer same-token",
      });
      expect(fp1).toBe(fp2);
    });
  });
});
