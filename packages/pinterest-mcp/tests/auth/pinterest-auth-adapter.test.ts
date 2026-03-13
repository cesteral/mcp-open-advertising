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
    it("calls GET /v5/user_account (not TikTok endpoint)", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          username: "pinterestuser",
          account_type: "BUSINESS",
        }),
      } as unknown as Response);

      const adapter = new PinterestAccessTokenAdapter(
        "test-token",
        "1234567890",
        "https://api.pinterest.com"
      );

      await adapter.validate();

      const call = mockFetchWithTimeout.mock.calls[0];
      const url = call[0] as string;
      expect(url).toBe("https://api.pinterest.com/v5/user_account");
    });

    it("validates token successfully and sets userId from username field", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          username: "pinterestuser",
          account_type: "BUSINESS",
        }),
      } as unknown as Response);

      const adapter = new PinterestAccessTokenAdapter(
        "test-token",
        "1234567890",
        "https://api.pinterest.com"
      );

      await expect(adapter.validate()).resolves.toBeUndefined();
      expect(adapter.userId).toBe("pinterestuser");
      expect(adapter.adAccountId).toBe("1234567890");
    });

    it("uses 'unknown' when username is missing from response", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          account_type: "BUSINESS",
        }),
      } as unknown as Response);

      const adapter = new PinterestAccessTokenAdapter(
        "test-token",
        "1234567890",
        "https://api.pinterest.com"
      );

      await adapter.validate();
      expect(adapter.userId).toBe("unknown");
    });

    it("throws on HTTP error (no code check — HTTP status only)", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Invalid token",
      } as unknown as Response);

      const adapter = new PinterestAccessTokenAdapter(
        "bad-token",
        "1234567890",
        "https://api.pinterest.com"
      );

      await expect(adapter.validate()).rejects.toThrow("Pinterest token validation HTTP error");
    });

    it("throws on 500 HTTP error", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Server error",
      } as unknown as Response);

      const adapter = new PinterestAccessTokenAdapter(
        "test-token",
        "1234567890",
        "https://api.pinterest.com"
      );

      await expect(adapter.validate()).rejects.toThrow("Pinterest token validation HTTP error");
    });

    it("does not re-validate an already validated token", async () => {
      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({
          username: "pinterestuser",
          account_type: "BUSINESS",
        }),
      } as unknown as Response);

      const adapter = new PinterestAccessTokenAdapter(
        "test-token",
        "1234567890",
        "https://api.pinterest.com"
      );

      await adapter.validate();
      await adapter.validate(); // second call should be a no-op

      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it("passes Authorization Bearer header to user_account endpoint", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          username: "pinterestuser",
          account_type: "BUSINESS",
        }),
      } as unknown as Response);

      const adapter = new PinterestAccessTokenAdapter(
        "my-secret-token",
        "1234567890",
        "https://api.pinterest.com"
      );

      await adapter.validate();

      const call = mockFetchWithTimeout.mock.calls[0];
      const options = call[3] as RequestInit;
      expect((options.headers as Record<string, string>)["Authorization"]).toBe(
        "Bearer my-secret-token"
      );
    });
  });

  describe("getAccessToken()", () => {
    it("returns the access token", async () => {
      const adapter = new PinterestAccessTokenAdapter(
        "my-access-token",
        "1234567890",
        "https://api.pinterest.com"
      );
      expect(await adapter.getAccessToken()).toBe("my-access-token");
    });
  });

  describe("adAccountId property", () => {
    it("exposes the advertiser ID", () => {
      const adapter = new PinterestAccessTokenAdapter(
        "test-token",
        "9876543210",
        "https://api.pinterest.com"
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

describe("PinterestRefreshTokenAdapter", () => {
  beforeEach(() => {
    mockFetchWithTimeout.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function mockTokenExchangeSuccess(body = {
    code: 0,
    message: "OK",
    data: {
      access_token: "new-access-token",
      expires_in: 86400,
      refresh_token: "new-refresh-token",
    },
  }) {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => body,
    } as unknown as Response);
  }

  function mockUserAccountSuccess(username = "Test User") {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        username,
        account_type: "BUSINESS",
      }),
    } as unknown as Response);
  }

  describe("validate()", () => {
    it("calls GET /v5/user_account (not TikTok endpoint)", async () => {
      const adapter = new PinterestRefreshTokenAdapter(
        MOCK_REFRESH_CREDENTIALS,
        "adv-123",
        "https://api.pinterest.com"
      );

      // First call: token exchange
      mockTokenExchangeSuccess();
      // Second call: user account validation
      mockUserAccountSuccess();

      await adapter.validate();

      const userAccountCall = mockFetchWithTimeout.mock.calls[1];
      const url = userAccountCall[0] as string;
      expect(url).toBe("https://api.pinterest.com/v5/user_account");
    });

    it("validates token and sets userId from username field", async () => {
      const adapter = new PinterestRefreshTokenAdapter(
        MOCK_REFRESH_CREDENTIALS,
        "adv-123",
        "https://api.pinterest.com"
      );

      mockTokenExchangeSuccess();
      mockUserAccountSuccess("pinterestuser");

      await adapter.validate();

      expect(adapter.userId).toBe("pinterestuser");
      expect(adapter.adAccountId).toBe("adv-123");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });

    it("uses 'unknown' when username is missing from user_account response", async () => {
      const adapter = new PinterestRefreshTokenAdapter(
        MOCK_REFRESH_CREDENTIALS,
        "adv-123",
        "https://api.pinterest.com"
      );

      mockTokenExchangeSuccess();
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ account_type: "BUSINESS" }),
      } as unknown as Response);

      await adapter.validate();
      expect(adapter.userId).toBe("unknown");
    });

    it("passes exchanged token in Authorization header to user_account", async () => {
      const adapter = new PinterestRefreshTokenAdapter(
        MOCK_REFRESH_CREDENTIALS,
        "adv-123",
        "https://api.pinterest.com"
      );

      mockTokenExchangeSuccess();
      mockUserAccountSuccess();

      await adapter.validate();

      const userAccountCall = mockFetchWithTimeout.mock.calls[1];
      const options = userAccountCall[3] as RequestInit;
      expect((options.headers as Record<string, string>)["Authorization"]).toBe(
        "Bearer new-access-token"
      );
    });

    it("throws on HTTP error from user_account (no code check)", async () => {
      const adapter = new PinterestRefreshTokenAdapter(
        MOCK_REFRESH_CREDENTIALS,
        "adv-123",
        "https://api.pinterest.com"
      );

      mockTokenExchangeSuccess();
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Invalid token",
      } as unknown as Response);

      await expect(adapter.validate()).rejects.toThrow("Pinterest token validation HTTP error");
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
