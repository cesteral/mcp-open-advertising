import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(),
}));

import { resolveSessionServices } from "../../src/mcp-server/tools/utils/resolve-session.js";
const mockResolveSessionServices = vi.mocked(resolveSessionServices);

import {
  GetAudienceCountInputSchema,
  getAudienceCountLogic,
  getAudienceCountResponseFormatter,
  getAudienceCountTool,
} from "../../src/mcp-server/tools/definitions/get-audience-count.tool.js";
import { allTools } from "../../src/mcp-server/tools/definitions/index.js";

const mockLinkedInService = { getAudienceCount: vi.fn() };
const mockContext = { requestId: "test-req-id", operationId: "test-op-id" };

// Audience Counts page, read 2026-10-01: GET /rest/audienceCounts?q=targetingCriteriaV2
// returns { active, total }; `total` is 0 when the audience is under 300, to protect
// member privacy, and 300 is the minimum audience to run a campaign.

const targetingCriteria = {
  include: {
    and: [
      { or: { "urn:li:adTargetingFacet:locations": ["urn:li:geo:102221843"] } },
      { or: { "urn:li:adTargetingFacet:skills": ["urn:li:skill:17"] } },
    ],
  },
};

describe("linkedin_get_audience_count tool", () => {
  beforeEach(() => {
    mockLinkedInService.getAudienceCount.mockReset();
    mockResolveSessionServices.mockReturnValue({
      httpClient: {} as any,
      linkedInService: mockLinkedInService as any,
      linkedInReportingService: {} as any,
    } as any);
  });

  it("is registered", () => {
    expect(allTools.map((t) => t.name)).toContain("linkedin_get_audience_count");
  });

  it("is a read, carries no governed annotation, and declares that it returns no platform text", () => {
    expect(getAudienceCountTool.annotations.readOnlyHint).toBe(true);
    expect(getAudienceCountTool.annotations).not.toHaveProperty("cesteral");
    expect(getAudienceCountTool.untrustedContent).toEqual({
      structuredPaths: [],
      contentBlocks: [],
    });
  });

  it("takes targeting criteria and nothing else", () => {
    expect(Object.keys(GetAudienceCountInputSchema.shape)).toEqual(["targetingCriteria"]);
    expect(GetAudienceCountInputSchema.safeParse({ targetingCriteria }).success).toBe(true);
    expect(GetAudienceCountInputSchema.safeParse({}).success).toBe(false);
  });

  it("rejects targeting that names a facet LinkedIn retired", () => {
    const result = GetAudienceCountInputSchema.safeParse({
      targetingCriteria: {
        include: {
          and: [{ or: { "urn:li:adTargetingFacet:memberSeniorities": ["urn:li:seniority:3"] } }],
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("returns the active and total counts", async () => {
    mockLinkedInService.getAudienceCount.mockResolvedValueOnce({
      elements: [{ active: 1200, total: 25312600 }],
    });
    const result = await getAudienceCountLogic({ targetingCriteria } as any, mockContext as any);
    expect(mockLinkedInService.getAudienceCount).toHaveBeenCalledWith(
      targetingCriteria,
      mockContext
    );
    expect(result).toMatchObject({ active: 1200, total: 25312600, belowPrivacyThreshold: false });
  });

  it("flags a total of 0 as LinkedIn's under-300 privacy floor, not as an empty audience", async () => {
    mockLinkedInService.getAudienceCount.mockResolvedValueOnce({
      elements: [{ active: 0, total: 0 }],
    });
    const result = await getAudienceCountLogic({ targetingCriteria } as any, mockContext as any);
    expect(result.belowPrivacyThreshold).toBe(true);
    const text = (getAudienceCountResponseFormatter(result)[0] as { text: string }).text;
    expect(text).toMatch(/fewer than 300|under 300|less than 300/i);
  });

  it("returns nulls when LinkedIn returns no element", async () => {
    mockLinkedInService.getAudienceCount.mockResolvedValueOnce({ elements: [] });
    const result = await getAudienceCountLogic({ targetingCriteria } as any, mockContext as any);
    expect(result).toMatchObject({ active: null, total: null, belowPrivacyThreshold: false });
  });
});
