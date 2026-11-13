import { describe, it, expect, vi, beforeEach } from "vitest";
import { JsonRpcErrorCode, McpError } from "@cesteral/shared";
import {
  AmazonDspAccessTokenAdapter,
  AmazonDspRefreshTokenAdapter,
} from "../../src/auth/amazon-dsp-auth-adapter.js";

const mockFetch = vi.hoisted(() => vi.fn());
vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: mockFetch };
});

describe("AmazonDspAccessTokenAdapter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("validates by calling POST /adsApi/v1/query/advertiserAccounts (not the deprecated GET /dsp/advertisers)", async () => {
    // basis: QueryAdvertiserAccount (AdvertiserAccounts API 3.0, https://advertising.amazon.com/API/docs/en-us/api-spec-v1-advertiseraccounts):
    // POST, body { maxResults 10..100 }, 200 { advertiserAccounts: [{ advertiserAccountId, displayName, ... }], nextToken? }.
    // The legacy GET /dsp/advertisers is deprecated (release note 2026-07-20).
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        advertiserAccounts: [
          { advertiserAccountId: "amzn1.ads-account.g.abc", displayName: "Test Advertiser" },
        ],
      }),
    });
    const adapter = new AmazonDspAccessTokenAdapter(
      "token123",
      "profile_123",
      "https://advertising-api.amazon.com"
    );
    await adapter.validate();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://advertising-api.amazon.com/adsApi/v1/query/advertiserAccounts",
      expect.any(Number),
      undefined,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ maxResults: 10 }) })
    );
    expect(adapter.userId).toBe("Test Advertiser");
  });

  it("includes Amazon required headers in validation request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ advertiserAccounts: [{ displayName: "Advertiser" }] }),
    });
    const adapter = new AmazonDspAccessTokenAdapter(
      "token123",
      "profile_123",
      "https://advertising-api.amazon.com",
      "my_client_id"
    );
    await adapter.validate();
    const callHeaders = mockFetch.mock.calls[0][3].headers;
    // The operation declares only ClientIdHeader (Amazon-Ads-ClientId); no scope header.
    expect(callHeaders["Amazon-Ads-ClientId"]).toBe("my_client_id");
    expect(callHeaders["Amazon-Advertising-API-Scope"]).toBeUndefined();
    expect(callHeaders["Amazon-Advertising-API-ClientId"]).toBeUndefined();
    expect(callHeaders.Authorization).toBe("Bearer token123");
  });

  it("throws on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "",
    });
    const adapter = new AmazonDspAccessTokenAdapter("bad_token", "profile_123");
    await expect(adapter.validate()).rejects.toThrow("401");
  });
});

describe("AmazonDspRefreshTokenAdapter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("refreshes via POST to Amazon LwA token endpoint", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "amz_token", token_type: "bearer", expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ advertiserAccounts: [{ displayName: "Advertiser" }] }),
      });
    const adapter = new AmazonDspRefreshTokenAdapter(
      { appId: "client_id", appSecret: "client_secret", refreshToken: "amz_rt" },
      "profile_123",
      "https://advertising-api.amazon.com"
    );
    await adapter.validate();
    expect(mockFetch.mock.calls[0][0]).toBe("https://api.amazon.com/auth/o2/token");
  });

  it("sends form-encoded body for token refresh", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "t1", expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ advertiserAccounts: [{ displayName: "A" }] }),
      });
    const adapter = new AmazonDspRefreshTokenAdapter(
      { appId: "my_client_id", appSecret: "my_secret", refreshToken: "my_rt" },
      "profile_123"
    );
    await adapter.validate();
    const refreshCall = mockFetch.mock.calls[0];
    expect(refreshCall[3].headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(refreshCall[3].body).toContain("grant_type=refresh_token");
    expect(refreshCall[3].body).toContain("client_id=my_client_id");
    expect(refreshCall[3].body).toContain("client_secret=my_secret");
    expect(refreshCall[3].body).toContain("refresh_token=my_rt");
  });

  it("reads access_token from flat OAuth2 response (no data wrapper)", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "flat_token", expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ advertiserAccounts: [{ displayName: "A" }] }),
      });
    const adapter = new AmazonDspRefreshTokenAdapter(
      { appId: "a", appSecret: "b", refreshToken: "c" },
      "profile_123"
    );
    const token = await adapter.getAccessToken();
    expect(token).toBe("flat_token");
  });

  it("throws if access_token missing in refresh response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: "invalid_grant" }),
    });
    const adapter = new AmazonDspRefreshTokenAdapter(
      { appId: "a", appSecret: "b", refreshToken: "bad" },
      "profile_123"
    );
    await expect(adapter.getAccessToken()).rejects.toThrow("access_token");
  });

  it("sends Amazon-Ads-ClientId and no scope header in the validation call", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "tok", expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ advertiserAccounts: [{ displayName: "A" }] }),
      });
    const adapter = new AmazonDspRefreshTokenAdapter(
      { appId: "my_client", appSecret: "s", refreshToken: "r" },
      "profile_456"
    );
    await adapter.validate();
    // Validation call is the second fetch call
    const validationHeaders = mockFetch.mock.calls[1][3].headers;
    expect(validationHeaders["Amazon-Ads-ClientId"]).toBe("my_client");
    expect(validationHeaders["Amazon-Advertising-API-ClientId"]).toBeUndefined();
    expect(validationHeaders["Amazon-Advertising-API-Scope"]).toBeUndefined();
  });

  it("classifies invalid_grant (expired/revoked refresh token) as Unauthorized", async () => {
    // LwA returns 400 {"error":"invalid_grant"} once a refresh token passes
    // Amazon's 365-day lifetime (consent granted on/after 2026-07-30).
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () =>
        JSON.stringify({ error: "invalid_grant", error_description: "refresh token expired" }),
    });
    const adapter = new AmazonDspRefreshTokenAdapter(
      { appId: "a", appSecret: "b", refreshToken: "expired" },
      "profile_123"
    );
    const err = await adapter.getAccessToken().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpError);
    expect((err as McpError).code).toBe(JsonRpcErrorCode.Unauthorized);
    expect((err as McpError).message).toContain("Re-authorization");
  });

  it("keeps transient token-endpoint failures (5xx) as InternalError", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: async () => "upstream down",
    });
    const adapter = new AmazonDspRefreshTokenAdapter(
      { appId: "a", appSecret: "b", refreshToken: "fine" },
      "profile_123"
    );
    const err = await adapter.getAccessToken().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpError);
    expect((err as McpError).code).toBe(JsonRpcErrorCode.InternalError);
  });
});
