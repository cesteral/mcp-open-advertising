import { describe, it, expect, vi, beforeEach } from "vitest";

const mockState = vi.hoisted(() => ({
  cm360Service: {
    getEntity: vi.fn(),
    createEntity: vi.fn(),
    updateEntity: vi.fn(),
    deleteEntity: vi.fn(),
    listEntities: vi.fn(),
    listUserProfiles: vi.fn(),
    listTargetingOptions: vi.fn(),
  },
  cm360ReportingService: {
    runReport: vi.fn(),
    createReport: vi.fn(),
    checkReportFile: vi.fn(),
    downloadReportFile: vi.fn(),
  },
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(() => mockState),
}));

vi.mock("../../src/mcp-server/tools/utils/entity-mapping.js", () => ({
  getEntityTypeEnum: () => [
    "campaign", "placement", "ad", "creative", "site",
    "advertiser", "floodlightActivity", "floodlightConfiguration",
  ],
  getDeletableEntityTypeEnum: () => ["floodlightActivity"],
}));

import {
  getAdPreviewLogic,
  getAdPreviewResponseFormatter,
  GetAdPreviewInputSchema,
} from "../../src/mcp-server/tools/definitions/get-ad-preview.tool.js";

const mockContext = { requestId: "test-req" } as any;

describe("getAdPreviewLogic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ad with preview URL from clickThroughUrl.computedClickThroughUrl", async () => {
    mockState.cm360Service.getEntity.mockResolvedValue({
      id: "ad-1",
      name: "Test Ad",
      clickThroughUrl: {
        computedClickThroughUrl: "https://example.com/landing",
      },
    });

    const result = await getAdPreviewLogic(
      { profileId: "prof-1", adId: "ad-1" },
      mockContext
    );

    expect(result.previewUrl).toBe("https://example.com/landing");
    expect(result.adId).toBe("ad-1");
    expect(mockState.cm360Service.getEntity).toHaveBeenCalledWith(
      "ad", "prof-1", "ad-1", mockContext
    );
  });

  it("returns undefined previewUrl when clickThroughUrl is missing", async () => {
    mockState.cm360Service.getEntity.mockResolvedValue({
      id: "ad-1",
      name: "Test Ad",
    });

    const result = await getAdPreviewLogic(
      { profileId: "prof-1", adId: "ad-1" },
      mockContext
    );

    expect(result.previewUrl).toBeUndefined();
  });

  it("returns undefined previewUrl when computedClickThroughUrl is missing", async () => {
    mockState.cm360Service.getEntity.mockResolvedValue({
      id: "ad-1",
      name: "Test Ad",
      clickThroughUrl: { defaultLandingPage: true },
    });

    const result = await getAdPreviewLogic(
      { profileId: "prof-1", adId: "ad-1" },
      mockContext
    );

    expect(result.previewUrl).toBeUndefined();
  });

  it("extracts adName from ad.name", async () => {
    mockState.cm360Service.getEntity.mockResolvedValue({
      id: "ad-1",
      name: "My Display Ad",
    });

    const result = await getAdPreviewLogic(
      { profileId: "prof-1", adId: "ad-1" },
      mockContext
    );

    expect(result.adName).toBe("My Display Ad");
  });

  it("returns undefined adName when ad has no name", async () => {
    mockState.cm360Service.getEntity.mockResolvedValue({
      id: "ad-1",
    });

    const result = await getAdPreviewLogic(
      { profileId: "prof-1", adId: "ad-1" },
      mockContext
    );

    expect(result.adName).toBeUndefined();
  });
});

describe("getAdPreviewResponseFormatter", () => {
  it("includes ad name in parentheses when present", () => {
    const result = getAdPreviewResponseFormatter({
      adId: "ad-1",
      adName: "Banner Ad",
      previewUrl: "https://example.com",
      ad: { id: "ad-1" },
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(result[0].text).toContain("(Banner Ad)");
  });

  it("shows 'No preview URL available' when no URL", () => {
    const result = getAdPreviewResponseFormatter({
      adId: "ad-1",
      adName: undefined,
      previewUrl: undefined,
      ad: { id: "ad-1" },
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(result[0].text).toContain("No preview URL available");
  });

  it("shows preview URL when available", () => {
    const result = getAdPreviewResponseFormatter({
      adId: "ad-1",
      adName: undefined,
      previewUrl: "https://example.com/preview",
      ad: { id: "ad-1" },
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(result[0].text).toContain("Preview URL: https://example.com/preview");
  });
});

describe("GetAdPreviewInputSchema", () => {
  it("requires profileId and adId", () => {
    const valid = GetAdPreviewInputSchema.safeParse({
      profileId: "123",
      adId: "456",
    });
    expect(valid.success).toBe(true);

    const missingProfile = GetAdPreviewInputSchema.safeParse({ adId: "456" });
    expect(missingProfile.success).toBe(false);

    const missingAdId = GetAdPreviewInputSchema.safeParse({ profileId: "123" });
    expect(missingAdId.success).toBe(false);
  });

  it("rejects empty profileId", () => {
    const result = GetAdPreviewInputSchema.safeParse({
      profileId: "",
      adId: "456",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty adId", () => {
    const result = GetAdPreviewInputSchema.safeParse({
      profileId: "123",
      adId: "",
    });
    expect(result.success).toBe(false);
  });
});
