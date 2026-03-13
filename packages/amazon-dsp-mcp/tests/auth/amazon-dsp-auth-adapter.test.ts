import { describe, it, expect, vi, beforeEach } from "vitest";
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
  beforeEach(() => { vi.resetAllMocks(); });

  it("validates by calling GET /dsp/advertisers (not TikTok endpoint)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ advertisers: [{ advertiserId: "adv_1", name: "Test Advertiser" }], totalResults: 1 }),
    });
    const adapter = new AmazonDspAccessTokenAdapter("token123", "profile_123", "https://advertising-api.amazon.com");
    await adapter.validate();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://advertising-api.amazon.com/dsp/advertisers?startIndex=0&count=1",
      expect.any(Number), undefined, expect.objectContaining({ method: "GET" })
    );
    expect(adapter.userId).toBeTruthy();
  });

  it("includes Amazon required headers in validation request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ advertisers: [{ advertiserId: "adv_1", name: "Advertiser" }], totalResults: 1 }),
    });
    const adapter = new AmazonDspAccessTokenAdapter("token123", "profile_123", "https://advertising-api.amazon.com", "my_client_id");
    await adapter.validate();
    const callHeaders = mockFetch.mock.calls[0][3].headers;
    expect(callHeaders["Amazon-Advertising-API-Scope"]).toBe("profile_123");
  });

  it("throws on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 401, statusText: "Unauthorized", text: async () => ""
    });
    const adapter = new AmazonDspAccessTokenAdapter("bad_token", "profile_123");
    await expect(adapter.validate()).rejects.toThrow("401");
  });
});

describe("AmazonDspRefreshTokenAdapter", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("refreshes via POST to Amazon LwA token endpoint", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "amz_token", token_type: "bearer", expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ advertisers: [{ name: "Advertiser" }], totalResults: 1 }) });
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
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "t1", expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ advertisers: [{ name: "A" }], totalResults: 1 }) });
    const adapter = new AmazonDspRefreshTokenAdapter(
      { appId: "my_client_id", appSecret: "my_secret", refreshToken: "my_rt" }, "profile_123"
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
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "flat_token", expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ advertisers: [{ name: "A" }], totalResults: 1 }) });
    const adapter = new AmazonDspRefreshTokenAdapter(
      { appId: "a", appSecret: "b", refreshToken: "c" }, "profile_123"
    );
    const token = await adapter.getAccessToken();
    expect(token).toBe("flat_token");
  });

  it("throws if access_token missing in refresh response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ error: "invalid_grant" })
    });
    const adapter = new AmazonDspRefreshTokenAdapter(
      { appId: "a", appSecret: "b", refreshToken: "bad" }, "profile_123"
    );
    await expect(adapter.getAccessToken()).rejects.toThrow("access_token");
  });

  it("includes Amazon-Advertising-API headers in validation call", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "tok", expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ advertisers: [{ name: "A" }], totalResults: 1 }) });
    const adapter = new AmazonDspRefreshTokenAdapter(
      { appId: "my_client", appSecret: "s", refreshToken: "r" }, "profile_456"
    );
    await adapter.validate();
    // Validation call is the second fetch call
    const validationHeaders = mockFetch.mock.calls[1][3].headers;
    expect(validationHeaders["Amazon-Advertising-API-ClientId"]).toBe("my_client");
    expect(validationHeaders["Amazon-Advertising-API-Scope"]).toBe("profile_456");
  });
});
