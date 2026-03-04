import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetchWithTimeout from shared
vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

import {
  LinkedInAccessTokenAdapter,
  parseLinkedInTokenFromHeaders,
  getLinkedInCredentialFingerprint,
} from "../../src/auth/linkedin-auth-adapter.js";

describe("LinkedInAccessTokenAdapter", () => {
  beforeEach(() => {
    mockFetchWithTimeout.mockReset();
  });

  describe("validate()", () => {
    it("validates successfully and sets personId", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "person-xyz789", vanityName: "jane-smith" }),
      } as unknown as Response);

      const adapter = new LinkedInAccessTokenAdapter(
        "test-access-token",
        "https://api.linkedin.com",
        "202409"
      );

      await adapter.validate();

      expect(adapter.personId).toBe("person-xyz789");
    });

    it("only calls API once (caches validated state)", async () => {
      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ id: "person-cached", vanityName: "test" }),
      } as unknown as Response);

      const adapter = new LinkedInAccessTokenAdapter("test-token", "https://api.linkedin.com");

      await adapter.validate();
      await adapter.validate();

      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it("throws on 401 response", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Invalid access token",
      } as unknown as Response);

      const adapter = new LinkedInAccessTokenAdapter("bad-token");

      await expect(adapter.validate()).rejects.toThrow("LinkedIn token validation failed");
    });

    it("sends correct LinkedIn headers in validation request", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "person-headers-test", vanityName: "test" }),
      } as unknown as Response);

      const adapter = new LinkedInAccessTokenAdapter(
        "my-token",
        "https://api.linkedin.com",
        "202409"
      );

      await adapter.validate();

      const callOptions = mockFetchWithTimeout.mock.calls[0][3];
      const headers = callOptions?.headers as Record<string, string> | undefined;
      expect(headers?.["Authorization"]).toBe("Bearer my-token");
      expect(headers?.["LinkedIn-Version"]).toBe("202409");
      expect(headers?.["X-Restli-Protocol-Version"]).toBe("2.0.0");
    });
  });

  describe("getAccessToken()", () => {
    it("returns the access token", async () => {
      const adapter = new LinkedInAccessTokenAdapter("my-access-token");
      const token = await adapter.getAccessToken();
      expect(token).toBe("my-access-token");
    });
  });
});

describe("parseLinkedInTokenFromHeaders", () => {
  it("parses Bearer token correctly", () => {
    const token = parseLinkedInTokenFromHeaders({
      authorization: "Bearer my-linkedin-token",
    });
    expect(token).toBe("my-linkedin-token");
  });

  it("parses Bearer token case-insensitively", () => {
    const token = parseLinkedInTokenFromHeaders({
      authorization: "BEARER my-linkedin-token",
    });
    expect(token).toBe("my-linkedin-token");
  });

  it("throws when authorization header is missing", () => {
    expect(() => parseLinkedInTokenFromHeaders({})).toThrow(
      "Missing required Authorization header"
    );
  });

  it("throws when scheme is not Bearer", () => {
    expect(() =>
      parseLinkedInTokenFromHeaders({ authorization: "Basic abc123" })
    ).toThrow("Authorization header must use Bearer scheme");
  });

  it("handles array authorization header", () => {
    const token = parseLinkedInTokenFromHeaders({
      authorization: ["Bearer first-token", "Bearer second-token"],
    });
    expect(token).toBe("first-token");
  });
});

describe("getLinkedInCredentialFingerprint", () => {
  it("returns a 16-character hex fingerprint", () => {
    const fingerprint = getLinkedInCredentialFingerprint("test-access-token");
    expect(fingerprint).toHaveLength(16);
    expect(fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  it("returns consistent fingerprint for same token", () => {
    const fp1 = getLinkedInCredentialFingerprint("same-token");
    const fp2 = getLinkedInCredentialFingerprint("same-token");
    expect(fp1).toBe(fp2);
  });

  it("returns different fingerprints for different tokens", () => {
    const fp1 = getLinkedInCredentialFingerprint("token-aaa");
    const fp2 = getLinkedInCredentialFingerprint("token-bbb");
    expect(fp1).not.toBe(fp2);
  });
});
