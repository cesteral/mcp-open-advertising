import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices, mockGetEntity } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
  mockGetEntity: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import { getAdPreviewLogic } from "../../src/mcp-server/tools/definitions/get-ad-preview.tool.js";

describe("gads_get_ad_preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveSessionServices.mockReturnValue({
      gadsService: { getEntity: mockGetEntity },
    });
  });

  it("uses ad.resourceName from GAQL response when present", async () => {
    mockGetEntity.mockResolvedValue({
      adGroupAd: {
        ad: {
          id: "987654321",
          type: "RESPONSIVE_SEARCH_AD",
          finalUrls: ["https://example.com"],
          resourceName: "customers/1234567890/ads/987654321",
        },
      },
    });

    const result = await getAdPreviewLogic(
      { customerId: "1234567890", adId: "987654321" },
      {} as any,
      { sessionId: "test-session" } as any
    );

    expect(result.resourceName).toBe("customers/1234567890/ads/987654321");
    expect(result.adType).toBe("RESPONSIVE_SEARCH_AD");
    expect(result.finalUrls).toEqual(["https://example.com"]);
    expect(result.adId).toBe("987654321");
    expect(result.customerId).toBe("1234567890");
  });

  it("falls back to constructed resourceName when ad.resourceName is absent", async () => {
    mockGetEntity.mockResolvedValue({
      adGroupAd: {
        ad: { id: "987654321", type: "IMAGE_AD" },
      },
    });

    const result = await getAdPreviewLogic(
      { customerId: "1234567890", adId: "987654321" },
      {} as any,
      { sessionId: "test-session" } as any
    );

    expect(result.resourceName).toBe("customers/1234567890/ads/987654321");
    expect(result.adType).toBe("IMAGE_AD");
  });

  it("falls back to constructed resourceName when ad object is missing", async () => {
    mockGetEntity.mockResolvedValue({ adGroupAd: {} });

    const result = await getAdPreviewLogic(
      { customerId: "5555555555", adId: "111111111" },
      {} as any,
      { sessionId: "test-session" } as any
    );

    expect(result.resourceName).toBe("customers/5555555555/ads/111111111");
    expect(result.adType).toBeUndefined();
    expect(result.finalUrls).toBeUndefined();
  });
});
