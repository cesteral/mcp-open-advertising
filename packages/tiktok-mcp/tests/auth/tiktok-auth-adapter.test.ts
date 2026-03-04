import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fetchWithTimeout from shared
vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

import {
  TikTokAccessTokenAdapter,
  parseTikTokTokenFromHeaders,
  getTikTokAdvertiserIdFromHeaders,
  getTikTokCredentialFingerprint,
} from "../../src/auth/tiktok-auth-adapter.js";

describe("TikTokAccessTokenAdapter", () => {
  beforeEach(() => {
    mockFetchWithTimeout.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("validate()", () => {
    it("validates token successfully on code=0 response", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          message: "OK",
          data: { display_name: "Test Advertiser", email: "test@example.com" },
        }),
      } as unknown as Response);

      const adapter = new TikTokAccessTokenAdapter(
        "test-token",
        "1234567890",
        "https://business-api.tiktok.com"
      );

      await expect(adapter.validate()).resolves.toBeUndefined();
      expect(adapter.userId).toBe("Test Advertiser");
      expect(adapter.advertiserId).toBe("1234567890");
    });

    it("throws on TikTok error code", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 40001,
          message: "Access token is expired",
          data: null,
        }),
      } as unknown as Response);

      const adapter = new TikTokAccessTokenAdapter(
        "bad-token",
        "1234567890",
        "https://business-api.tiktok.com"
      );

      await expect(adapter.validate()).rejects.toThrow("TikTok token validation failed");
    });

    it("throws on HTTP error", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Server error",
      } as unknown as Response);

      const adapter = new TikTokAccessTokenAdapter(
        "test-token",
        "1234567890",
        "https://business-api.tiktok.com"
      );

      await expect(adapter.validate()).rejects.toThrow("TikTok token validation HTTP error");
    });

    it("does not re-validate an already validated token", async () => {
      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          message: "OK",
          data: { display_name: "Test Advertiser" },
        }),
      } as unknown as Response);

      const adapter = new TikTokAccessTokenAdapter(
        "test-token",
        "1234567890",
        "https://business-api.tiktok.com"
      );

      await adapter.validate();
      await adapter.validate(); // second call should be a no-op

      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });
  });

  describe("getAccessToken()", () => {
    it("returns the access token", async () => {
      const adapter = new TikTokAccessTokenAdapter(
        "my-access-token",
        "1234567890",
        "https://business-api.tiktok.com"
      );
      expect(await adapter.getAccessToken()).toBe("my-access-token");
    });
  });

  describe("advertiserId property", () => {
    it("exposes the advertiser ID", () => {
      const adapter = new TikTokAccessTokenAdapter(
        "test-token",
        "9876543210",
        "https://business-api.tiktok.com"
      );
      expect(adapter.advertiserId).toBe("9876543210");
    });
  });
});

describe("parseTikTokTokenFromHeaders", () => {
  it("parses Bearer token correctly", () => {
    const token = parseTikTokTokenFromHeaders({
      authorization: "Bearer my-tiktok-token",
    });
    expect(token).toBe("my-tiktok-token");
  });

  it("throws when Authorization header is missing", () => {
    expect(() => parseTikTokTokenFromHeaders({})).toThrow(
      "Missing required Authorization header"
    );
  });

  it("throws when Authorization header has wrong scheme", () => {
    expect(() =>
      parseTikTokTokenFromHeaders({ authorization: "Basic abc123" })
    ).toThrow("Authorization header must use Bearer scheme");
  });
});

describe("getTikTokAdvertiserIdFromHeaders", () => {
  it("reads X-TikTok-Advertiser-Id (lowercase)", () => {
    const id = getTikTokAdvertiserIdFromHeaders({
      "x-tiktok-advertiser-id": "1234567890",
    });
    expect(id).toBe("1234567890");
  });

  it("throws when header is missing", () => {
    expect(() => getTikTokAdvertiserIdFromHeaders({})).toThrow(
      "Missing required X-TikTok-Advertiser-Id header"
    );
  });
});

describe("getTikTokCredentialFingerprint", () => {
  it("returns a 16-char hex string", () => {
    const fp = getTikTokCredentialFingerprint("test-token", "1234567890");
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });

  it("returns consistent fingerprints for same inputs", () => {
    const fp1 = getTikTokCredentialFingerprint("token", "id");
    const fp2 = getTikTokCredentialFingerprint("token", "id");
    expect(fp1).toBe(fp2);
  });

  it("returns different fingerprints for different tokens", () => {
    const fp1 = getTikTokCredentialFingerprint("token-a", "same-id");
    const fp2 = getTikTokCredentialFingerprint("token-b", "same-id");
    expect(fp1).not.toBe(fp2);
  });

  it("returns different fingerprints for different advertiser IDs", () => {
    const fp1 = getTikTokCredentialFingerprint("same-token", "id-a");
    const fp2 = getTikTokCredentialFingerprint("same-token", "id-b");
    expect(fp1).not.toBe(fp2);
  });
});
