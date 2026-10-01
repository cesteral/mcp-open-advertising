import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(),
}));

import { resolveSessionServices } from "../../src/mcp-server/tools/utils/resolve-session.js";
const mockResolveSessionServices = vi.mocked(resolveSessionServices);

import {
  GetTargetingOptionsInputSchema,
  getTargetingOptionsLogic,
  getTargetingOptionsResponseFormatter,
  getTargetingOptionsTool,
} from "../../src/mcp-server/tools/definitions/get-targeting-options.tool.js";

const mockLinkedInService = { listTargetingFacets: vi.fn() };
const mockContext = { requestId: "test-req-id", operationId: "test-op-id" };

// GET /rest/adTargetingFacets is "a plain GET": no finder, no parameters, no
// account (Ad Targeting page, read 2026-10-01). It returns facet descriptors:
// facetName, availableEntityFinders, entityTypes, adTargetingFacetUrn.

describe("linkedin_get_targeting_options tool", () => {
  beforeEach(() => {
    mockLinkedInService.listTargetingFacets.mockReset();
    mockResolveSessionServices.mockReturnValue({
      httpClient: {} as any,
      linkedInService: mockLinkedInService as any,
      linkedInReportingService: {} as any,
    } as any);
  });

  it("takes no parameters, because the endpoint takes none", () => {
    expect(Object.keys(GetTargetingOptionsInputSchema.shape)).toEqual([]);
  });

  it("lists the facet descriptors LinkedIn returns", async () => {
    const elements = [
      {
        facetName: "industries",
        availableEntityFinders: ["AD_TARGETING_FACET", "TYPEAHEAD", "SIMILAR_ENTITIES"],
        entityTypes: ["INDUSTRY"],
        adTargetingFacetUrn: "urn:li:adTargetingFacet:industries",
      },
    ];
    mockLinkedInService.listTargetingFacets.mockResolvedValueOnce({ elements });

    const result = await getTargetingOptionsLogic({}, mockContext as any);

    expect(mockLinkedInService.listTargetingFacets).toHaveBeenCalledWith(mockContext);
    expect(result.facets).toEqual(elements);
    expect(result.count).toBe(1);
    expect(result).not.toHaveProperty("pagination");
  });

  it("tolerates a response with no elements", async () => {
    mockLinkedInService.listTargetingFacets.mockResolvedValueOnce({});
    const result = await getTargetingOptionsLogic({}, mockContext as any);
    expect(result.facets).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("points at linkedin_search_targeting for the values, in the description and the output", async () => {
    expect(getTargetingOptionsTool.description).toContain("linkedin_search_targeting");
    const text = (
      getTargetingOptionsResponseFormatter({
        facets: [{ facetName: "genders" }],
        count: 1,
        timestamp: "2026-10-01T00:00:00.000Z",
      })[0] as { text: string }
    ).text;
    expect(text).toContain("genders");
    expect(text).toContain("linkedin_search_targeting");
  });

  it("no longer takes an ad account, a facetType, or paging", () => {
    for (const gone of ["adAccountUrn", "facetType", "start", "limit"]) {
      expect(GetTargetingOptionsInputSchema.shape).not.toHaveProperty(gone);
    }
  });
});
