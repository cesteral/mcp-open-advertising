import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fetchWithTimeout from shared
vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

import {
  LinkedInAccessTokenAdapter,
  LinkedInRefreshTokenAdapter,
  parseLinkedInTokenFromHeaders,
  parseLinkedInRefreshCredentialsFromHeaders,
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
  it("returns a 32-character hex fingerprint", () => {
    const fingerprint = getLinkedInCredentialFingerprint("test-access-token");
    expect(fingerprint).toHaveLength(32);
    expect(fingerprint).toMatch(/^[0-9a-f]{32}$/);
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

const MOCK_REFRESH_CREDENTIALS = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  refreshToken: "test-refresh-token",
};

const MOCK_TOKEN_RESPONSE = {
  access_token: "li-new-token",
  expires_in: 5184000,
  refresh_token: "li-new-refresh",
  refresh_token_expires_in: 31536000,
};

const MOCK_ME_RESPONSE = {
  id: "person-123",
  vanityName: "testuser",
};

describe("LinkedInRefreshTokenAdapter", () => {
  beforeEach(() => {
    mockFetchWithTimeout.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function mockTokenExchange(body = MOCK_TOKEN_RESPONSE) {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => body,
    } as unknown as Response);
  }

  function mockMeResponse(body = MOCK_ME_RESPONSE) {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => body,
    } as unknown as Response);
  }

  describe("getAccessToken", () => {
    it("fetches new token when no cache", async () => {
      const adapter = new LinkedInRefreshTokenAdapter(MOCK_REFRESH_CREDENTIALS);
      mockTokenExchange();

      const token = await adapter.getAccessToken();

      expect(token).toBe("li-new-token");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);

      // Verify it POSTs to the correct OAuth2 endpoint with form-encoded body
      const call = mockFetchWithTimeout.mock.calls[0];
      expect(call[0]).toBe("https://www.linkedin.com/oauth/v2/accessToken");
      const options = call[3] as RequestInit;
      expect(options.method).toBe("POST");
      expect((options.headers as Record<string, string>)["Content-Type"]).toBe(
        "application/x-www-form-urlencoded"
      );
      const body = new URLSearchParams(options.body as string);
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("refresh_token")).toBe("test-refresh-token");
      expect(body.get("client_id")).toBe("test-client-id");
      expect(body.get("client_secret")).toBe("test-client-secret");
    });

    it("returns cached token when not expired", async () => {
      vi.useFakeTimers();

      const adapter = new LinkedInRefreshTokenAdapter(MOCK_REFRESH_CREDENTIALS);
      mockTokenExchange();

      const first = await adapter.getAccessToken();
      expect(first).toBe("li-new-token");

      // Advance time but stay within validity window (5184000s - 60s buffer)
      vi.advanceTimersByTime(1000 * 1000); // 1000s, well within range

      const second = await adapter.getAccessToken();
      expect(second).toBe("li-new-token");

      // fetch should only have been called once
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it("fetches new token when expired", async () => {
      vi.useFakeTimers();

      const adapter = new LinkedInRefreshTokenAdapter(MOCK_REFRESH_CREDENTIALS);
      mockTokenExchange();

      const first = await adapter.getAccessToken();
      expect(first).toBe("li-new-token");

      // Advance past expiry: expires_in=5184000s, buffer=60s => 5183940s validity
      vi.advanceTimersByTime(5183941 * 1000);

      mockTokenExchange({
        access_token: "li-refreshed-token",
        expires_in: 5184000,
        refresh_token: "li-new-refresh-2",
        refresh_token_expires_in: 31536000,
      });

      const second = await adapter.getAccessToken();
      expect(second).toBe("li-refreshed-token");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });

    it("concurrent calls share pending auth (mutex)", async () => {
      const adapter = new LinkedInRefreshTokenAdapter(MOCK_REFRESH_CREDENTIALS);

      let resolveToken!: (value: unknown) => void;
      mockFetchWithTimeout.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveToken = resolve;
        })
      );

      const p1 = adapter.getAccessToken();
      const p2 = adapter.getAccessToken();
      const p3 = adapter.getAccessToken();

      // Resolve the single in-flight fetch
      resolveToken({
        ok: true,
        json: async () => MOCK_TOKEN_RESPONSE,
      } as unknown as Response);

      const [t1, t2, t3] = await Promise.all([p1, p2, p3]);
      expect(t1).toBe("li-new-token");
      expect(t2).toBe("li-new-token");
      expect(t3).toBe("li-new-token");

      // fetch was only called once
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it("clears pending on failure (retry works)", async () => {
      const adapter = new LinkedInRefreshTokenAdapter(MOCK_REFRESH_CREDENTIALS);

      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Bad credentials",
      } as unknown as Response);

      await expect(adapter.getAccessToken()).rejects.toThrow(
        "LinkedIn token refresh failed"
      );

      // After failure, pendingAuth should be cleared so a second call retries
      mockTokenExchange();
      const token = await adapter.getAccessToken();
      expect(token).toBe("li-new-token");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });

    it("throws error on non-ok HTTP response", async () => {
      const adapter = new LinkedInRefreshTokenAdapter(MOCK_REFRESH_CREDENTIALS);

      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Invalid client credentials",
      } as unknown as Response);

      await expect(adapter.getAccessToken()).rejects.toThrow(
        "LinkedIn token refresh failed: 401 Unauthorized. Invalid client credentials"
      );
    });

    it("throws error on missing access_token in response", async () => {
      const adapter = new LinkedInRefreshTokenAdapter(MOCK_REFRESH_CREDENTIALS);

      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ expires_in: 5184000 }),
      } as unknown as Response);

      await expect(adapter.getAccessToken()).rejects.toThrow(
        "LinkedIn token refresh returned no access_token"
      );
    });
  });

  describe("validate", () => {
    it("validates token and sets personId", async () => {
      const adapter = new LinkedInRefreshTokenAdapter(MOCK_REFRESH_CREDENTIALS);

      // First call: token exchange (getAccessToken inside validate)
      mockTokenExchange();
      // Second call: GET /v2/me
      mockMeResponse();

      await adapter.validate();

      expect(adapter.personId).toBe("person-123");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);

      // Verify the /v2/me call has correct headers
      const meCall = mockFetchWithTimeout.mock.calls[1];
      expect(meCall[0]).toContain("/v2/me");
      const meOptions = meCall[3] as { headers: Record<string, string> };
      expect(meOptions.headers["Authorization"]).toBe("Bearer li-new-token");
      expect(meOptions.headers["LinkedIn-Version"]).toBe("202501");
      expect(meOptions.headers["X-Restli-Protocol-Version"]).toBe("2.0.0");
    });
  });

  describe("refresh token rotation", () => {
    it("uses new refresh token from response on subsequent exchanges", async () => {
      vi.useFakeTimers();

      const adapter = new LinkedInRefreshTokenAdapter(MOCK_REFRESH_CREDENTIALS);

      // First exchange returns a new refresh_token
      mockTokenExchange({
        access_token: "li-token-1",
        expires_in: 5184000,
        refresh_token: "li-rotated-refresh",
        refresh_token_expires_in: 31536000,
      });

      const first = await adapter.getAccessToken();
      expect(first).toBe("li-token-1");

      // Expire the cached token
      vi.advanceTimersByTime(5183941 * 1000);

      // Second exchange
      mockTokenExchange({
        access_token: "li-token-2",
        expires_in: 5184000,
        refresh_token: "li-rotated-refresh-2",
        refresh_token_expires_in: 31536000,
      });

      const second = await adapter.getAccessToken();
      expect(second).toBe("li-token-2");

      // Verify the second exchange used the rotated refresh token
      const secondCall = mockFetchWithTimeout.mock.calls[1];
      const secondOptions = secondCall[3] as RequestInit;
      const secondBody = new URLSearchParams(secondOptions.body as string);
      expect(secondBody.get("refresh_token")).toBe("li-rotated-refresh");
    });
  });
});

describe("parseLinkedInRefreshCredentialsFromHeaders", () => {
  it("returns credentials when all 3 headers present", () => {
    const result = parseLinkedInRefreshCredentialsFromHeaders({
      "x-linkedin-client-id": "my-client-id",
      "x-linkedin-client-secret": "my-client-secret",
      "x-linkedin-refresh-token": "my-refresh-token",
    });
    expect(result).toEqual({
      clientId: "my-client-id",
      clientSecret: "my-client-secret",
      refreshToken: "my-refresh-token",
    });
  });

  it("returns undefined when client-id is missing", () => {
    const result = parseLinkedInRefreshCredentialsFromHeaders({
      "x-linkedin-client-secret": "my-client-secret",
      "x-linkedin-refresh-token": "my-refresh-token",
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when client-secret is missing", () => {
    const result = parseLinkedInRefreshCredentialsFromHeaders({
      "x-linkedin-client-id": "my-client-id",
      "x-linkedin-refresh-token": "my-refresh-token",
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when refresh-token is missing", () => {
    const result = parseLinkedInRefreshCredentialsFromHeaders({
      "x-linkedin-client-id": "my-client-id",
      "x-linkedin-client-secret": "my-client-secret",
    });
    expect(result).toBeUndefined();
  });
});
