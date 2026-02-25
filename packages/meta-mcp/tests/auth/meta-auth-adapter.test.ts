import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  MetaAccessTokenAdapter,
  parseMetaTokenFromHeaders,
  getMetaCredentialFingerprint,
} from "../../src/auth/meta-auth-adapter.js";

// Mock fetchWithTimeout from shared
vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

describe("getMetaCredentialFingerprint", () => {
  it("returns deterministic 16-char hex output", () => {
    const fp1 = getMetaCredentialFingerprint("EAABwzLixnjY...");
    const fp2 = getMetaCredentialFingerprint("EAABwzLixnjY...");
    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(16);
    expect(fp1).toMatch(/^[0-9a-f]{16}$/);
  });

  it("produces different fingerprints for tokens with same 16-char prefix", () => {
    const sharedPrefix = "EAABwzLixnjYBAA"; // 16 chars
    const tokenA = sharedPrefix + "aaaa_different_suffix_A";
    const tokenB = sharedPrefix + "bbbb_different_suffix_B";
    const fpA = getMetaCredentialFingerprint(tokenA);
    const fpB = getMetaCredentialFingerprint(tokenB);
    expect(fpA).not.toBe(fpB);
  });

  it("trims whitespace before hashing", () => {
    const fp1 = getMetaCredentialFingerprint("  mytoken  ");
    const fp2 = getMetaCredentialFingerprint("mytoken");
    expect(fp1).toBe(fp2);
  });
});

describe("parseMetaTokenFromHeaders", () => {
  it("extracts Bearer token from Authorization header", () => {
    const token = parseMetaTokenFromHeaders({
      authorization: "Bearer EAABwzLixnjYBAA",
    });
    expect(token).toBe("EAABwzLixnjYBAA");
  });

  it("is case-insensitive for Bearer scheme", () => {
    const token = parseMetaTokenFromHeaders({
      authorization: "bearer EAABwzLixnjYBAA",
    });
    expect(token).toBe("EAABwzLixnjYBAA");
  });

  it("throws on missing Authorization header", () => {
    expect(() => parseMetaTokenFromHeaders({})).toThrow(
      "Missing required Authorization header"
    );
  });

  it("throws on non-Bearer Authorization header", () => {
    expect(() =>
      parseMetaTokenFromHeaders({ authorization: "Basic abc123" })
    ).toThrow("Authorization header must use Bearer scheme");
  });

  it("handles array header values (takes first)", () => {
    const token = parseMetaTokenFromHeaders({
      authorization: ["Bearer token1", "Bearer token2"],
    });
    expect(token).toBe("token1");
  });
});

describe("MetaAccessTokenAdapter", () => {
  beforeEach(() => {
    mockFetchWithTimeout.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockSuccessResponse(body = { id: "12345", name: "Test User" }) {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => body,
    } as unknown as Response);
  }

  describe("validate()", () => {
    it("calls /me and sets userId", async () => {
      const adapter = new MetaAccessTokenAdapter("test-token", "https://graph.test/v21.0");
      mockSuccessResponse();

      await adapter.validate();
      expect(adapter.userId).toBe("12345");
    });

    it("caches result on subsequent calls", async () => {
      const adapter = new MetaAccessTokenAdapter("test-token");
      mockSuccessResponse();

      await adapter.validate();
      await adapter.validate();

      expect(adapter.userId).toBe("12345");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it("uses sanitized URL on timeout (no raw token in error)", async () => {
      const adapter = new MetaAccessTokenAdapter(
        "SECRET_TOKEN_123",
        "https://graph.test/v21.0"
      );

      // Simulate a call where we can inspect the sanitizer arg
      mockFetchWithTimeout.mockRejectedValueOnce(
        new Error("Request timeout after 10000ms: https://graph.test/v21.0/me?fields=id,name&access_token=***")
      );

      await expect(adapter.validate()).rejects.toThrow("access_token=***");

      // Verify the sanitizer was passed as the 5th argument
      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining("access_token=SECRET_TOKEN_123"),
        10_000,
        undefined,
        undefined,
        expect.any(Function)
      );
    });

    it("throws on non-ok response", async () => {
      const adapter = new MetaAccessTokenAdapter("bad-token");
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Invalid token",
      } as unknown as Response);

      await expect(adapter.validate()).rejects.toThrow(
        "Meta token validation failed: 401 Unauthorized"
      );
    });
  });

  describe("getAccessToken()", () => {
    it("returns the token", async () => {
      const adapter = new MetaAccessTokenAdapter("my-access-token");
      const token = await adapter.getAccessToken();
      expect(token).toBe("my-access-token");
    });
  });
});
