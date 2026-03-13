import { describe, it, expect, vi, beforeEach } from "vitest";
import { AmazonDspBearerAuthStrategy } from "../../src/auth/amazon-dsp-auth-strategy.js";

const mockValidate = vi.hoisted(() => vi.fn());
vi.mock("../../src/auth/amazon-dsp-auth-adapter.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/auth/amazon-dsp-auth-adapter.js")>();
  return {
    ...actual,
    AmazonDspAccessTokenAdapter: vi.fn().mockImplementation(() => ({
      validate: mockValidate,
      userId: "test-advertiser",
      profileId: "profile_123",
      getAccessToken: vi.fn().mockResolvedValue("token123"),
    })),
    AmazonDspRefreshTokenAdapter: vi.fn().mockImplementation(() => ({
      validate: mockValidate,
      userId: "refresh-advertiser",
      profileId: "profile_456",
      getAccessToken: vi.fn().mockResolvedValue("refreshed_token"),
    })),
  };
});

describe("AmazonDspBearerAuthStrategy", () => {
  const baseUrl = "https://advertising-api.amazon.com";

  beforeEach(() => {
    vi.clearAllMocks();
    mockValidate.mockResolvedValue(undefined);
  });

  it("sets authType to amazon-dsp-bearer (hyphen not underscore) on access token branch", async () => {
    const strategy = new AmazonDspBearerAuthStrategy(baseUrl);
    const result = await strategy.verify({
      authorization: "Bearer static_token",
      "x-amazon-dsp-advertiser-id": "profile_123",
    });
    expect(result.authInfo.authType).toBe("amazon-dsp-bearer");
  });

  it("sets authType to amazon-dsp-bearer on refresh token branch", async () => {
    const strategy = new AmazonDspBearerAuthStrategy(baseUrl);
    const result = await strategy.verify({
      "x-amazon-dsp-app-id": "app123",
      "x-amazon-dsp-app-secret": "secret456",
      "x-amazon-dsp-refresh-token": "refresh789",
      "x-amazon-dsp-advertiser-id": "profile_456",
    });
    expect(result.authInfo.authType).toBe("amazon-dsp-bearer");
  });

  it("rejects when advertiser ID header is missing", async () => {
    const strategy = new AmazonDspBearerAuthStrategy(baseUrl);
    await expect(
      strategy.verify({
        authorization: "Bearer static_token",
        // no x-amazon-dsp-advertiser-id
      })
    ).rejects.toThrow("X-AmazonDsp-Advertiser-Id");
  });
});
