import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fetchWithTimeout from shared
vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

import {
  PinterestAccessTokenAdapter,
  PinterestRefreshTokenAdapter,
  parsePinterestTokenFromHeaders,
  parsePinterestRefreshCredentialsFromHeaders,
  getPinterestAdvertiserIdFromHeaders,
  getPinterestCredentialFingerprint,
} from "../../src/auth/pinterest-auth-adapter.js";

describe("PinterestAccessTokenAdapter", () => {
  beforeEach(() => {
    mockFetchWithTimeout.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("validate()", () => {
    it("validates token successfully on v5 user_account response", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          username: "testadvertiser",
          account_type: "BUSINESS",
        }),
      } as unknown as Response);

      const adapter = new PinterestAccessTokenAdapter(
        "test-token",
        "1234567890",
        "https://api.pinterest.com"
      );

      await expect(adapter.validate()).resolves.toBeUndefined();
      expect(adapter.userId).toBe("testadvertiser");
      expect(adapter.adAccountId).toBe("1234567890");
    });

    it("throws on HTTP error", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Server error",
      } as unknown as Response);

      const adapter = new PinterestAccessTokenAdapter(
        "test-token",
        "1234567890",
        "https://business-api.pinterest.com"
      );

      await expect(adapter.validate()).rejects.toThrow("Pinterest token validation HTTP error");
    });

    it("does not re-validate an already validated token", async () => {
      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({
          username: "testadvertiser",
          account_type: "BUSINESS",
        }),
      } as unknown as Response);

      const adapter = new PinterestAccessTokenAdapter(
        "test-token",
        "1234567890",
        "https://business-api.pinterest.com"
      );

      await adapter.validate();
      await adapter.validate(); // second call should be a no-op

      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });
  });

  describe("getAccessToken()", () => {
    it("returns the access token", async () => {
      const adapter = new PinterestAccessTokenAdapter(
        "my-access-token",
        "1234567890",
        "https://business-api.pinterest.com"
      );
      expect(await adapter.getAccessToken()).toBe("my-access-token");
    });
  });

  describe("adAccountId property", () => {
    it("exposes the advertiser ID", () => {
      const adapter = new PinterestAccessTokenAdapter(
        "test-token",
        "9876543210",
        "https://business-api.pinterest.com"
      );
      expect(adapter.adAccountId).toBe("9876543210");
    });
  });
});

describe("parsePinterestTokenFromHeaders", () => {
  it("parses Bearer token correctly", () => {
    const token = parsePinterestTokenFromHeaders({
      authorization: "Bearer my-pinterest-token",
    });
    expect(token).toBe("my-pinterest-token");
  });

  it("throws when Authorization header is missing", () => {
    expect(() => parsePinterestTokenFromHeaders({})).toThrow(
      "Missing required Authorization header"
    );
  });

  it("throws when Authorization header has wrong scheme", () => {
    expect(() =>
      parsePinterestTokenFromHeaders({ authorization: "Basic abc123" })
    ).toThrow("Authorization header must use Bearer scheme");
  });
});

describe("getPinterestAdvertiserIdFromHeaders", () => {
  it("reads X-Pinterest-Advertiser-Id (lowercase)", () => {
    const id = getPinterestAdvertiserIdFromHeaders({
      "x-pinterest-advertiser-id": "1234567890",
    });
    expect(id).toBe("1234567890");
  });

  it("throws when header is missing", () => {
    expect(() => getPinterestAdvertiserIdFromHeaders({})).toThrow(
      "Missing required X-Pinterest-Advertiser-Id header"
    );
  });
});

describe("getPinterestCredentialFingerprint", () => {
  it("returns a 32-char hex string", () => {
    const fp = getPinterestCredentialFingerprint("test-token", "1234567890");
    expect(fp).toMatch(/^[0-9a-f]{32}$/);
  });

  it("returns consistent fingerprints for same inputs", () => {
    const fp1 = getPinterestCredentialFingerprint("token", "id");
    const fp2 = getPinterestCredentialFingerprint("token", "id");
    expect(fp1).toBe(fp2);
  });

  it("returns different fingerprints for different tokens", () => {
    const fp1 = getPinterestCredentialFingerprint("token-a", "same-id");
    const fp2 = getPinterestCredentialFingerprint("token-b", "same-id");
    expect(fp1).not.toBe(fp2);
  });

  it("returns different fingerprints for different advertiser IDs", () => {
    const fp1 = getPinterestCredentialFingerprint("same-token", "id-a");
    const fp2 = getPinterestCredentialFingerprint("same-token", "id-b");
    expect(fp1).not.toBe(fp2);
  });
});

const MOCK_REFRESH_CREDENTIALS = {
  appId: "test-app-id",
  appSecret: "test-app-secret",
  refreshToken: "test-refresh-token",
};

const MOCK_TOKEN_EXCHANGE_RESPONSE = {
  access_token: "new-access-token",
  token_type: "bearer",
  expires_in: 86400,
  refresh_token: "new-refresh-token",
};

describe("PinterestRefreshTokenAdapter", () => {
  beforeEach(() => {
    mockFetchWithTimeout.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function mockTokenExchangeSuccess(body = MOCK_TOKEN_EXCHANGE_RESPONSE) {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => body,
    } as unknown as Response);
  }

  function mockUserInfoSuccess() {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        username: "testuser",
        account_type: "BUSINESS",
      }),
    } as unknown as Response);
  }

  describe("getAccessToken", () => {
    it("fetches new token when no cache", async () => {
      const adapter = new PinterestRefreshTokenAdapter(
        MOCK_REFRESH_CREDENTIALS,
        "adv-123",
        "https://business-api.pinterest.com"
      );
      mockTokenExchangeSuccess();

      const token = await adapter.getAccessToken();

      expect(token).toBe("new-access-token");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);

      // Verify correct POST URL, headers, and form-encoded body
      const call = mockFetchWithTimeout.mock.calls[0];
      const url = call[0] as string;
      const options = call[3] as RequestInit & { headers: Record<string, string> };

      expect(url).toBe("https://api.pinterest.com/v5/oauth/token");
      expect(options.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
      expect(options.headers["Authorization"]).toMatch(/^Basic /);
      expect(options.body).toContain("grant_type=refresh_token");
      expect(options.body).toContain("refresh_token=test-refresh-token");
    });

    it("returns cached token when not expired", async () => {
      vi.useFakeTimers();

      const adapter = new PinterestRefreshTokenAdapter(
        MOCK_REFRESH_CREDENTIALS,
        "adv-123"
      );
      mockTokenExchangeSuccess();

      const first = await adapter.getAccessToken();
      expect(first).toBe("new-access-token");

      // Advance time but stay within validity (86400s - 60s buffer = 86340s)
      vi.advanceTimersByTime(50_000 * 1000); // 50000s, well within range

      const second = await adapter.getAccessToken();
      expect(second).toBe("new-access-token");

      // fetch should only have been called once
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it("fetches new token when expired", async () => {
      vi.useFakeTimers();

      const adapter = new PinterestRefreshTokenAdapter(
        MOCK_REFRESH_CREDENTIALS,
        "adv-123"
      );
      mockTokenExchangeSuccess();

      const first = await adapter.getAccessToken();
      expect(first).toBe("new-access-token");

      // Advance past expiry: expires_in=86400s, buffer=60s => 86340s validity
      vi.advanceTimersByTime(86341 * 1000);

      mockTokenExchangeSuccess({
        access_token: "refreshed-token",
        token_type: "bearer",
        expires_in: 86400,
        refresh_token: "another-refresh",
      });

      const second = await adapter.getAccessToken();
      expect(second).toBe("refreshed-token");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });

    it("concurrent calls share pending auth (mutex)", async () => {
      const adapter = new PinterestRefreshTokenAdapter(
        MOCK_REFRESH_CREDENTIALS,
        "adv-123"
      );

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
        json: async () => MOCK_TOKEN_EXCHANGE_RESPONSE,
      } as unknown as Response);

      const [t1, t2, t3] = await Promise.all([p1, p2, p3]);
      expect(t1).toBe("new-access-token");
      expect(t2).toBe("new-access-token");
      expect(t3).toBe("new-access-token");

      // fetch was only called once
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it("clears pending on failure (retry works)", async () => {
      const adapter = new PinterestRefreshTokenAdapter(
        MOCK_REFRESH_CREDENTIALS,
        "adv-123"
      );

      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Bad credentials",
      } as unknown as Response);

      await expect(adapter.getAccessToken()).rejects.toThrow(
        "Pinterest token refresh failed"
      );

      // After failure, pendingAuth should be cleared so a second call retries
      mockTokenExchangeSuccess();
      const token = await adapter.getAccessToken();
      expect(token).toBe("new-access-token");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });

    it("error on non-ok HTTP response", async () => {
      const adapter = new PinterestRefreshTokenAdapter(
        MOCK_REFRESH_CREDENTIALS,
        "adv-123"
      );

      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Invalid credentials",
      } as unknown as Response);

      await expect(adapter.getAccessToken()).rejects.toThrow(
        "Pinterest token refresh failed: 401 Unauthorized. Invalid credentials"
      );
    });

    it("error when access_token is missing from response", async () => {
      const adapter = new PinterestRefreshTokenAdapter(
        MOCK_REFRESH_CREDENTIALS,
        "adv-123"
      );

      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: "invalid_grant",
          error_description: "The refresh token is invalid",
        }),
      } as unknown as Response);

      await expect(adapter.getAccessToken()).rejects.toThrow(
        "Pinterest token refresh failed: missing access_token in response"
      );
    });
  });

  describe("validate", () => {
    it("validates token via user info endpoint", async () => {
      const adapter = new PinterestRefreshTokenAdapter(
        MOCK_REFRESH_CREDENTIALS,
        "adv-123",
        "https://business-api.pinterest.com"
      );

      // First call: token exchange
      mockTokenExchangeSuccess();
      // Second call: user info validation
      mockUserInfoSuccess();

      await adapter.validate();

      expect(adapter.userId).toBe("testuser");
      expect(adapter.adAccountId).toBe("adv-123");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);

      // Verify the user account call used the exchanged token
      const userInfoCall = mockFetchWithTimeout.mock.calls[1];
      const userInfoUrl = userInfoCall[0] as string;
      const userInfoOptions = userInfoCall[3] as RequestInit;

      expect(userInfoUrl).toBe(
        "https://business-api.pinterest.com/v5/user_account"
      );
      expect(
        (userInfoOptions.headers as Record<string, string>)["Authorization"]
      ).toBe("Bearer new-access-token");
    });
  });

  describe("refresh token rotation", () => {
    it("uses rotated refresh token on subsequent exchanges", async () => {
      vi.useFakeTimers();

      const adapter = new PinterestRefreshTokenAdapter(
        MOCK_REFRESH_CREDENTIALS,
        "adv-123"
      );

      // First exchange returns a new refresh_token
      mockTokenExchangeSuccess({
        access_token: "token-1",
        token_type: "bearer",
        expires_in: 86400,
        refresh_token: "rotated-refresh-token",
      });

      const first = await adapter.getAccessToken();
      expect(first).toBe("token-1");

      // Expire the cached token
      vi.advanceTimersByTime(86341 * 1000);

      // Second exchange
      mockTokenExchangeSuccess({
        access_token: "token-2",
        token_type: "bearer",
        expires_in: 86400,
        refresh_token: "rotated-again",
      });

      const second = await adapter.getAccessToken();
      expect(second).toBe("token-2");

      // Verify the second exchange used the rotated refresh token
      const secondCall = mockFetchWithTimeout.mock.calls[1];
      const secondBody = (secondCall[3] as RequestInit).body as string;
      expect(secondBody).toContain("refresh_token=rotated-refresh-token");
    });
  });
});

describe("parsePinterestRefreshCredentialsFromHeaders", () => {
  it("returns credentials when all 3 headers present", () => {
    const result = parsePinterestRefreshCredentialsFromHeaders({
      "x-pinterest-app-id": "my-app",
      "x-pinterest-app-secret": "my-secret",
      "x-pinterest-refresh-token": "my-refresh",
    });
    expect(result).toEqual({
      appId: "my-app",
      appSecret: "my-secret",
      refreshToken: "my-refresh",
    });
  });

  it("returns undefined when x-pinterest-app-id is missing", () => {
    const result = parsePinterestRefreshCredentialsFromHeaders({
      "x-pinterest-app-secret": "my-secret",
      "x-pinterest-refresh-token": "my-refresh",
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when x-pinterest-app-secret is missing", () => {
    const result = parsePinterestRefreshCredentialsFromHeaders({
      "x-pinterest-app-id": "my-app",
      "x-pinterest-refresh-token": "my-refresh",
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when x-pinterest-refresh-token is missing", () => {
    const result = parsePinterestRefreshCredentialsFromHeaders({
      "x-pinterest-app-id": "my-app",
      "x-pinterest-app-secret": "my-secret",
    });
    expect(result).toBeUndefined();
  });
});
