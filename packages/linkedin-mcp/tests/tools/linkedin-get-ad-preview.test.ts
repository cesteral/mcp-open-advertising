import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(),
}));

import { resolveSessionServices } from "../../src/mcp-server/tools/utils/resolve-session.js";
const mockResolveSessionServices = vi.mocked(resolveSessionServices);

import {
  GetAdPreviewInputSchema,
  getAdPreviewLogic,
  getAdPreviewResponseFormatter,
  getAdPreviewTool,
} from "../../src/mcp-server/tools/definitions/get-ad-preview.tool.js";

const mockLinkedInService = { getAdPreviews: vi.fn() };
const mockContext = { requestId: "test-req-id", operationId: "test-op-id" };

// Ad Preview page, read 2026-10-01: an existing creative is previewed with
// GET /rest/adPreviews?q=creative&creative={sponsoredCreativeUrn}&account={sponsoredAccountUrn}.
// There is no adFormat parameter. iframes are valid for about 3 hours.

describe("linkedin_get_ad_preview tool", () => {
  beforeEach(() => {
    mockLinkedInService.getAdPreviews.mockReset();
    mockResolveSessionServices.mockReturnValue({
      httpClient: {} as any,
      linkedInService: mockLinkedInService as any,
      linkedInReportingService: {} as any,
    } as any);
  });

  it("requires the creative and its ad account", () => {
    const ok = {
      creativeUrn: "urn:li:sponsoredCreative:123456789",
      adAccountUrn: "urn:li:sponsoredAccount:123456789",
    };
    expect(GetAdPreviewInputSchema.safeParse(ok).success).toBe(true);
    expect(GetAdPreviewInputSchema.safeParse({ creativeUrn: ok.creativeUrn }).success).toBe(false);
  });

  it("no longer takes an adFormat, which LinkedIn does not document", () => {
    expect(GetAdPreviewInputSchema.shape).not.toHaveProperty("adFormat");
    expect(getAdPreviewTool.description).not.toContain("SINGLE_IMAGE_AD");
  });

  it("passes the creative and the account to the service", async () => {
    mockLinkedInService.getAdPreviews.mockResolvedValueOnce({ elements: [] });
    const result = await getAdPreviewLogic(
      { creativeUrn: "urn:li:sponsoredCreative:1", adAccountUrn: "urn:li:sponsoredAccount:2" },
      mockContext as any
    );
    expect(mockLinkedInService.getAdPreviews).toHaveBeenCalledWith(
      "urn:li:sponsoredCreative:1",
      "urn:li:sponsoredAccount:2",
      mockContext
    );
    expect(result.creativeUrn).toBe("urn:li:sponsoredCreative:1");
  });

  it("tells the caller the iframes expire", () => {
    expect(getAdPreviewTool.description).toMatch(/3 hours|three hours/i);
    const text = (
      getAdPreviewResponseFormatter({
        preview: { elements: [] },
        creativeUrn: "urn:li:sponsoredCreative:1",
        timestamp: "2026-10-01T00:00:00.000Z",
      })[0] as { text: string }
    ).text;
    expect(text).toMatch(/3 hours|three hours/i);
  });
});
