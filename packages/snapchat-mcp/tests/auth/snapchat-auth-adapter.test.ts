import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetchWithTimeout from shared
vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetch = vi.mocked(fetchWithTimeout);

import {
  SnapchatAccessTokenAdapter,
  SnapchatRefreshTokenAdapter,
  parseSnapchatTokenFromHeaders,
  parseSnapchatRefreshCredentialsFromHeaders,
  getSnapchatAdvertiserIdFromHeaders,
  getSnapchatCredentialFingerprint,
} from "../../src/auth/snapchat-auth-adapter.js";

describe("SnapchatAccessTokenAdapter", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("validates by calling GET /v1/me (Snapchat endpoint, not TikTok)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        request_status: "SUCCESS",
        me: { id: "user_1", display_name: "Test User" },
      }),
    });
    const adapter = new SnapchatAccessTokenAdapter(
      "token",
      "acct_123",
      "https://adsapi.snapchat.com"
    );
    await adapter.validate();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://adsapi.snapchat.com/v1/me",
      expect.any(Number),
      undefined,
      expect.objectContaining({ method: "GET" })
    );
    expect(adapter.userId).toBe("user_1");
  });

  it("sets userId from me.id field", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        request_status: "SUCCESS",
        me: { id: "snap_user_456", display_name: "Snap User" },
      }),
    });
    const adapter = new SnapchatAccessTokenAdapter("token", "acct_123");
    await adapter.validate();
    expect(adapter.userId).toBe("snap_user_456");
  });

  it("throws on HTTP error without checking code field", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "Invalid token",
    });
    const adapter = new SnapchatAccessTokenAdapter("bad_token", "acct_123");
    await expect(adapter.validate()).rejects.toThrow("401");
  });

  it("does not validate twice (cached)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ request_status: "SUCCESS", me: { id: "u1", display_name: "User" } }),
    });
    const adapter = new SnapchatAccessTokenAdapter("token", "acct_123");
    await adapter.validate();
    await adapter.validate();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns the access token", async () => {
    const adapter = new SnapchatAccessTokenAdapter("my-access-token", "1234567890");
    expect(await adapter.getAccessToken()).toBe("my-access-token");
  });

  it("exposes the advertiser ID", () => {
    const adapter = new SnapchatAccessTokenAdapter("test-token", "9876543210");
    expect(adapter.adAccountId).toBe("9876543210");
  });
});

describe("SnapchatRefreshTokenAdapter", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("refreshes via POST to Snapchat accounts domain (not TikTok endpoint)", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "snap_token", expires_in: 1800 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ request_status: "SUCCESS", me: { id: "u1", display_name: "User" } }),
      });
    const adapter = new SnapchatRefreshTokenAdapter(
      { appId: "cid", appSecret: "cs", refreshToken: "rt" },
      "acct_123",
      "https://adsapi.snapchat.com"
    );
    await adapter.validate();
    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://accounts.snapchat.com/login/oauth2/access_token"
    );
  });

  it("sends form-encoded refresh token body", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "snap_token", expires_in: 1800 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ request_status: "SUCCESS", me: { id: "u1", display_name: "User" } }),
      });
    const adapter = new SnapchatRefreshTokenAdapter(
      { appId: "my_client_id", appSecret: "my_secret", refreshToken: "my_rt" },
      "acct_123"
    );
    await adapter.validate();
    const refreshCall = mockFetch.mock.calls[0];
    expect(refreshCall[3].headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(refreshCall[3].body).toContain("grant_type=refresh_token");
    expect(refreshCall[3].body).toContain("client_id=my_client_id");
    expect(refreshCall[3].body).toContain("client_secret=my_secret");
    expect(refreshCall[3].body).toContain("refresh_token=my_rt");
  });

  it("reads access_token from top-level (flat OAuth2, no data wrapper)", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "flat_token", expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ request_status: "SUCCESS", me: { id: "u1", display_name: "User" } }),
      });
    const adapter = new SnapchatRefreshTokenAdapter(
      { appId: "a", appSecret: "b", refreshToken: "c" },
      "acct_123"
    );
    const token = await adapter.getAccessToken();
    expect(token).toBe("flat_token");
  });

  it("throws if access_token missing in refresh response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: "invalid_grant" }),
    });
    const adapter = new SnapchatRefreshTokenAdapter(
      { appId: "a", appSecret: "b", refreshToken: "bad" },
      "acct_123"
    );
    await expect(adapter.getAccessToken()).rejects.toThrow("access_token");
  });

  it("rotates refresh token if new one provided", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "t1", expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "t2", refresh_token: "new_rt", expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "t3", expires_in: 3600 }),
      });
    const adapter = new SnapchatRefreshTokenAdapter(
      { appId: "a", appSecret: "b", refreshToken: "old_rt" },
      "acct_123"
    );
    // First call — gets t1, currentRefreshToken stays "old_rt"
    await adapter.getAccessToken();
    // Force expire for second call
    (adapter as any).tokenExpiresAt = 0;
    // Second call — gets t2 and rotates currentRefreshToken to "new_rt"
    await adapter.getAccessToken();
    // Force expire for third call
    (adapter as any).tokenExpiresAt = 0;
    // Third call — body should use the rotated "new_rt"
    await adapter.getAccessToken();
    const thirdCall = mockFetch.mock.calls[2];
    expect(thirdCall[3].body).toContain("refresh_token=new_rt");
  });

  it("returns cached token when not expired", async () => {
    vi.useFakeTimers();
    const adapter = new SnapchatRefreshTokenAdapter(
      { appId: "a", appSecret: "b", refreshToken: "rt" },
      "adv-123"
    );
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "cached-token", expires_in: 86400 }),
    });

    const first = await adapter.getAccessToken();
    expect(first).toBe("cached-token");

    // Advance time but stay within validity (86400s - 60s buffer = 86340s)
    vi.advanceTimersByTime(50_000 * 1000);
    const second = await adapter.getAccessToken();
    expect(second).toBe("cached-token");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("fetches new token when expired", async () => {
    vi.useFakeTimers();
    const adapter = new SnapchatRefreshTokenAdapter(
      { appId: "a", appSecret: "b", refreshToken: "rt" },
      "adv-123"
    );
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "first-token", expires_in: 86400 }),
    });

    await adapter.getAccessToken();

    // Advance past expiry
    vi.advanceTimersByTime(86341 * 1000);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "refreshed-token", expires_in: 86400 }),
    });
    const second = await adapter.getAccessToken();
    expect(second).toBe("refreshed-token");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("concurrent calls share pending auth (mutex)", async () => {
    const adapter = new SnapchatRefreshTokenAdapter(
      { appId: "a", appSecret: "b", refreshToken: "rt" },
      "adv-123"
    );

    let resolveToken!: (value: unknown) => void;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveToken = resolve;
      })
    );

    const p1 = adapter.getAccessToken();
    const p2 = adapter.getAccessToken();
    const p3 = adapter.getAccessToken();

    resolveToken({
      ok: true,
      json: async () => ({ access_token: "shared-token", expires_in: 86400 }),
    });

    const [t1, t2, t3] = await Promise.all([p1, p2, p3]);
    expect(t1).toBe("shared-token");
    expect(t2).toBe("shared-token");
    expect(t3).toBe("shared-token");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("clears pending on failure (retry works)", async () => {
    const adapter = new SnapchatRefreshTokenAdapter(
      { appId: "a", appSecret: "b", refreshToken: "rt" },
      "adv-123"
    );

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "Bad credentials",
    });

    await expect(adapter.getAccessToken()).rejects.toThrow("Snapchat token refresh failed");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "new-access-token", expires_in: 86400 }),
    });
    const token = await adapter.getAccessToken();
    expect(token).toBe("new-access-token");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("validates token via /v1/me Snapchat endpoint", async () => {
    const adapter = new SnapchatRefreshTokenAdapter(
      { appId: "app-id", appSecret: "secret", refreshToken: "refresh" },
      "adv-123",
      "https://adsapi.snapchat.com"
    );

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "new-access-token", expires_in: 86400 }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        request_status: "SUCCESS",
        me: { id: "snap-user-123", display_name: "Snap User" },
      }),
    });

    await adapter.validate();

    expect(adapter.userId).toBe("snap-user-123");
    expect(adapter.adAccountId).toBe("adv-123");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const userInfoCall = mockFetch.mock.calls[1];
    expect(userInfoCall[0]).toBe("https://adsapi.snapchat.com/v1/me");
    expect((userInfoCall[3].headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer new-access-token"
    );
  });
});

describe("parseSnapchatTokenFromHeaders", () => {
  it("parses Bearer token correctly", () => {
    const token = parseSnapchatTokenFromHeaders({
      authorization: "Bearer my-snapchat-token",
    });
    expect(token).toBe("my-snapchat-token");
  });

  it("throws when Authorization header is missing", () => {
    expect(() => parseSnapchatTokenFromHeaders({})).toThrow(
      "Missing required Authorization header"
    );
  });

  it("throws when Authorization header has wrong scheme", () => {
    expect(() => parseSnapchatTokenFromHeaders({ authorization: "Basic abc123" })).toThrow(
      "Authorization header must use Bearer scheme"
    );
  });
});

describe("getSnapchatAdvertiserIdFromHeaders", () => {
  it("reads X-Snapchat-Advertiser-Id (lowercase)", () => {
    const id = getSnapchatAdvertiserIdFromHeaders({
      "x-snapchat-advertiser-id": "1234567890",
    });
    expect(id).toBe("1234567890");
  });

  it("throws when header is missing", () => {
    expect(() => getSnapchatAdvertiserIdFromHeaders({})).toThrow(
      "Missing required X-Snapchat-Advertiser-Id header"
    );
  });
});

describe("getSnapchatCredentialFingerprint", () => {
  it("returns a 32-char hex string", () => {
    const fp = getSnapchatCredentialFingerprint("test-token", "1234567890");
    expect(fp).toMatch(/^[0-9a-f]{32}$/);
  });

  it("returns consistent fingerprints for same inputs", () => {
    const fp1 = getSnapchatCredentialFingerprint("token", "id");
    const fp2 = getSnapchatCredentialFingerprint("token", "id");
    expect(fp1).toBe(fp2);
  });

  it("returns different fingerprints for different tokens", () => {
    const fp1 = getSnapchatCredentialFingerprint("token-a", "same-id");
    const fp2 = getSnapchatCredentialFingerprint("token-b", "same-id");
    expect(fp1).not.toBe(fp2);
  });

  it("returns different fingerprints for different advertiser IDs", () => {
    const fp1 = getSnapchatCredentialFingerprint("same-token", "id-a");
    const fp2 = getSnapchatCredentialFingerprint("same-token", "id-b");
    expect(fp1).not.toBe(fp2);
  });
});

describe("parseSnapchatRefreshCredentialsFromHeaders", () => {
  it("returns credentials when all 3 headers present", () => {
    const result = parseSnapchatRefreshCredentialsFromHeaders({
      "x-snapchat-app-id": "my-app",
      "x-snapchat-app-secret": "my-secret",
      "x-snapchat-refresh-token": "my-refresh",
    });
    expect(result).toEqual({
      appId: "my-app",
      appSecret: "my-secret",
      refreshToken: "my-refresh",
    });
  });

  it("returns undefined when x-snapchat-app-id is missing", () => {
    const result = parseSnapchatRefreshCredentialsFromHeaders({
      "x-snapchat-app-secret": "my-secret",
      "x-snapchat-refresh-token": "my-refresh",
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when x-snapchat-app-secret is missing", () => {
    const result = parseSnapchatRefreshCredentialsFromHeaders({
      "x-snapchat-app-id": "my-app",
      "x-snapchat-refresh-token": "my-refresh",
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when x-snapchat-refresh-token is missing", () => {
    const result = parseSnapchatRefreshCredentialsFromHeaders({
      "x-snapchat-app-id": "my-app",
      "x-snapchat-app-secret": "my-secret",
    });
    expect(result).toBeUndefined();
  });
});
