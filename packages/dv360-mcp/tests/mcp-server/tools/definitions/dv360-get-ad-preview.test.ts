import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  getAdPreviewLogic,
  getAdPreviewResponseFormatter,
} from "../../../../src/mcp-server/tools/definitions/get-ad-preview.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

// v4 Discovery `Creative` has no `previewUrl`; the renderable fields are
// `thirdPartyTag` (third-party display) and `vastTagUrl` (third-party VAST).
describe("dv360_get_ad_preview", () => {
  let getEntity: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getEntity = vi.fn();
    mockResolveSessionServices.mockReturnValue({ dv360Service: { getEntity } });
  });

  it("returns the third-party tag, hosting source and review status of the creative", async () => {
    getEntity.mockResolvedValue({
      displayName: "Banner",
      creativeType: "CREATIVE_TYPE_STANDARD",
      hostingSource: "HOSTING_SOURCE_THIRD_PARTY",
      thirdPartyTag: "<script src='https://ads.example/tag.js'></script>",
      reviewStatus: { approvalStatus: "APPROVAL_STATUS_APPROVED_SERVABLE" },
      dimensions: { widthPixels: 300, heightPixels: 250 },
    });

    const result = await getAdPreviewLogic({ advertiserId: "1", creativeId: "c-1" }, ctx, sdk);

    expect(getEntity).toHaveBeenCalledWith(
      "creative",
      expect.objectContaining({ advertiserId: "1", creativeId: "c-1" }),
      ctx
    );
    expect(result.thirdPartyTag).toContain("tag.js");
    expect(result.hostingSource).toBe("HOSTING_SOURCE_THIRD_PARTY");
    expect(result.reviewStatus).toEqual({ approvalStatus: "APPROVAL_STATUS_APPROVED_SERVABLE" });
    expect(result.previewUrl).toBeNull();

    const text = getAdPreviewResponseFormatter(result)[0].text;
    expect(text).toContain("Third-party tag:");
    expect(text).toContain("APPROVAL_STATUS_APPROVED_SERVABLE");
  });

  it("returns the VAST tag URL for a third-party VAST creative", async () => {
    getEntity.mockResolvedValue({
      creativeType: "CREATIVE_TYPE_VIDEO",
      hostingSource: "HOSTING_SOURCE_THIRD_PARTY",
      vastTagUrl: "https://ads.example/vast.xml",
    });
    const result = await getAdPreviewLogic({ advertiserId: "1", creativeId: "c-2" }, ctx, sdk);
    expect(result.vastTagUrl).toBe("https://ads.example/vast.xml");
    expect(getAdPreviewResponseFormatter(result)[0].text).toContain(
      "VAST tag URL: https://ads.example/vast.xml"
    );
  });

  it("says plainly that DV360 has no preview URL for a hosted creative", async () => {
    getEntity.mockResolvedValue({
      creativeType: "CREATIVE_TYPE_STANDARD",
      hostingSource: "HOSTING_SOURCE_HOSTED",
    });
    const result = await getAdPreviewLogic({ advertiserId: "1", creativeId: "c-3" }, ctx, sdk);
    expect(result.previewUrl).toBeNull();
    expect(getAdPreviewResponseFormatter(result)[0].text).toContain(
      "DV360's API provides no preview URL"
    );
  });
});
