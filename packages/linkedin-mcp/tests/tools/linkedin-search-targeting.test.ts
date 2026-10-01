import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(),
}));

import { resolveSessionServices } from "../../src/mcp-server/tools/utils/resolve-session.js";
const mockResolveSessionServices = vi.mocked(resolveSessionServices);

import {
  SearchTargetingInputSchema,
  searchTargetingLogic,
  searchTargetingResponseFormatter,
  searchTargetingTool,
} from "../../src/mcp-server/tools/definitions/search-targeting.tool.js";

const mockLinkedInService = { getTargetingEntities: vi.fn() };
const mockContext = { requestId: "test-req-id", operationId: "test-op-id" };

// LinkedIn documents four finders on /rest/adTargetingEntities (Ad Targeting page,
// read 2026-10-01): adTargetingFacet, typeahead, similarEntities, urns. The tool
// picks one from the arguments, and none of them takes start/count.

describe("linkedin_search_targeting tool", () => {
  beforeEach(() => {
    mockLinkedInService.getTargetingEntities.mockReset();
    mockResolveSessionServices.mockReturnValue({
      httpClient: {} as any,
      linkedInService: mockLinkedInService as any,
      linkedInReportingService: {} as any,
    } as any);
  });

  describe("input schema", () => {
    const parse = (input: unknown) => SearchTargetingInputSchema.safeParse(input);

    it("accepts a facet on its own, to browse it", () => {
      expect(parse({ facet: "seniorities" }).success).toBe(true);
    });

    it("accepts a facet with a query, to search it", () => {
      expect(parse({ facet: "industries", query: "software" }).success).toBe(true);
    });

    it("accepts a facet with seed entities, to find similar ones", () => {
      expect(parse({ facet: "employers", entities: ["urn:li:organization:1003"] }).success).toBe(
        true
      );
    });

    it("accepts URNs on their own, to resolve their names", () => {
      expect(parse({ urns: ["urn:li:geo:102095887"] }).success).toBe(true);
    });

    it("requires a facet unless resolving URNs", () => {
      expect(parse({}).success).toBe(false);
      expect(parse({ query: "x" }).success).toBe(false);
    });

    it("does not take a facet when resolving URNs", () => {
      expect(parse({ facet: "locations", urns: ["urn:li:geo:1"] }).success).toBe(false);
    });

    it("does not mix a query with seed entities or URNs", () => {
      expect(
        parse({ facet: "employers", query: "x", entities: ["urn:li:organization:1"] }).success
      ).toBe(false);
      expect(parse({ urns: ["urn:li:geo:1"], query: "x" }).success).toBe(false);
    });

    it("has no start parameter, since LinkedIn documents no offset on these finders", () => {
      expect(Object.keys(SearchTargetingInputSchema._def.schema.shape)).not.toContain("start");
    });

    it("no longer advertises the made-up facet types", () => {
      const text = JSON.stringify([
        searchTargetingTool.description,
        searchTargetingTool.inputExamples,
      ]);
      for (const bad of [
        "MEMBER_SKILLS",
        "MEMBER_SENIORITY",
        "MEMBER_JOB_TITLE",
        '"GEO"',
        "geos",
      ]) {
        expect(text, bad).not.toContain(bad);
      }
    });
  });

  describe("searchTargetingLogic()", () => {
    it("browses with the adTargetingFacet finder when there is no query", async () => {
      mockLinkedInService.getTargetingEntities.mockResolvedValueOnce({
        elements: [
          {
            urn: "urn:li:seniority:3",
            facetUrn: "urn:li:adTargetingFacet:seniorities",
            name: "Entry",
          },
        ],
      });
      const result = await searchTargetingLogic({ facet: "seniorities" }, mockContext as any);
      expect(mockLinkedInService.getTargetingEntities).toHaveBeenCalledWith(
        { finder: "adTargetingFacet", facet: "seniorities" },
        mockContext
      );
      expect(result.finder).toBe("adTargetingFacet");
      expect(result.elements).toHaveLength(1);
      expect(result.returned).toBe(1);
      expect(result.truncated).toBe(false);
    });

    it("searches with the typeahead finder when there is a query", async () => {
      mockLinkedInService.getTargetingEntities.mockResolvedValueOnce({ elements: [] });
      await searchTargetingLogic(
        { facet: "fieldsOfStudy", query: "econ", entityType: "FIELD_OF_STUDY" },
        mockContext as any
      );
      expect(mockLinkedInService.getTargetingEntities).toHaveBeenCalledWith(
        {
          finder: "typeahead",
          facet: "fieldsOfStudy",
          query: "econ",
          entityType: "FIELD_OF_STUDY",
        },
        mockContext
      );
    });

    it("uses similarEntities when given seed entities", async () => {
      mockLinkedInService.getTargetingEntities.mockResolvedValueOnce({ elements: [] });
      await searchTargetingLogic(
        { facet: "employers", entities: ["urn:li:organization:1003"] },
        mockContext as any
      );
      expect(mockLinkedInService.getTargetingEntities).toHaveBeenCalledWith(
        { finder: "similarEntities", facet: "employers", entities: ["urn:li:organization:1003"] },
        mockContext
      );
    });

    it("uses the urns finder, with no facet, when given URNs", async () => {
      mockLinkedInService.getTargetingEntities.mockResolvedValueOnce({ elements: [] });
      await searchTargetingLogic({ urns: ["urn:li:geo:1"] }, mockContext as any);
      expect(mockLinkedInService.getTargetingEntities).toHaveBeenCalledWith(
        { finder: "urns", urns: ["urn:li:geo:1"] },
        mockContext
      );
    });

    it("passes the locale through", async () => {
      mockLinkedInService.getTargetingEntities.mockResolvedValueOnce({ elements: [] });
      await searchTargetingLogic(
        { facet: "genders", locale: { language: "de", country: "DE" } },
        mockContext as any
      );
      expect(mockLinkedInService.getTargetingEntities.mock.calls[0]![0]).toMatchObject({
        locale: { language: "de", country: "DE" },
      });
    });

    it("limits what it returns, and says it did, because LinkedIn documents no paging", async () => {
      const elements = Array.from({ length: 150 }, (_, i) => ({ urn: `urn:li:skill:${i}` }));
      mockLinkedInService.getTargetingEntities.mockResolvedValueOnce({ elements });
      const result = await searchTargetingLogic(
        { facet: "skills", limit: 100 },
        mockContext as any
      );
      expect(result.elements).toHaveLength(100);
      expect(result.returned).toBe(100);
      expect(result.totalFromLinkedIn).toBe(150);
      expect(result.truncated).toBe(true);
      expect(result).not.toHaveProperty("pagination");
    });

    it("refuses a facetless non-urns request that skipped schema validation", async () => {
      await expect(searchTargetingLogic({ query: "x" }, mockContext as any)).rejects.toThrow(
        /facet/
      );
      expect(mockLinkedInService.getTargetingEntities).not.toHaveBeenCalled();
    });

    it("tolerates a response with no elements", async () => {
      mockLinkedInService.getTargetingEntities.mockResolvedValueOnce({});
      const result = await searchTargetingLogic({ facet: "genders" }, mockContext as any);
      expect(result.elements).toEqual([]);
      expect(result.truncated).toBe(false);
    });
  });

  describe("searchTargetingResponseFormatter()", () => {
    const base = {
      finder: "adTargetingFacet" as const,
      facet: "urn:li:adTargetingFacet:genders",
      elements: [{ urn: "urn:li:gender:MALE", name: "Male" }],
      returned: 1,
      totalFromLinkedIn: 1,
      truncated: false,
      timestamp: "2026-10-01T00:00:00.000Z",
    };

    it("renders the facet, the count and the elements", () => {
      const text = (searchTargetingResponseFormatter(base)[0] as { text: string }).text;
      expect(text).toContain("urn:li:adTargetingFacet:genders");
      expect(text).toContain("urn:li:gender:MALE");
    });

    it("says when the list was cut and how to narrow it", () => {
      const text = (
        searchTargetingResponseFormatter({
          ...base,
          returned: 1,
          totalFromLinkedIn: 300,
          truncated: true,
        })[0] as { text: string }
      ).text;
      expect(text).toContain("1 of 300");
      expect(text).toMatch(/query/);
    });
  });

  it("declares its results as platform text", () => {
    expect(searchTargetingTool.untrustedContent?.structuredPaths).toContain("$.elements");
  });
});
