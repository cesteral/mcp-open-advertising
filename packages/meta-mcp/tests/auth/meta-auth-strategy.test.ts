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
      expect(result.credentialFingerprint).toHaveLength(16);
      expect(result.credentialFingerprint).toMatch(/^[0-9a-f]{16}$/);
    });

    it("throws on invalid token", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Invalid OAuth access token",
      } as unknown as Response);

      const strategy = new MetaBearerAuthStrategy("https://graph.test/v21.0", mockLogger);
      await expect(
        strategy.verify({ authorization: "Bearer bad-token" })
      ).rejects.toThrow("Meta token validation failed");
    });

    it("throws when Authorization header is missing", async () => {
      const strategy = new MetaBearerAuthStrategy("https://graph.test/v21.0", mockLogger);
      await expect(strategy.verify({})).rejects.toThrow(
        "Missing required Authorization header"
      );
    });
  });

  describe("getCredentialFingerprint()", () => {
    it("returns fingerprint without network call (no validate())", async () => {
      const strategy = new MetaBearerAuthStrategy("https://graph.test/v21.0", mockLogger);
      const fingerprint = await strategy.getCredentialFingerprint({
        authorization: "Bearer test-meta-token-for-fingerprint",
      });

      expect(fingerprint).toBeDefined();
      expect(fingerprint).toHaveLength(16);
      expect(fingerprint).toMatch(/^[0-9a-f]{16}$/);

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
