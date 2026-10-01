import { describe, it, expect, vi, beforeEach } from "vitest";
import { LinkedInService } from "../../src/services/linkedin/linkedin-service.js";
import { encodeRestliQuery } from "../../src/services/linkedin/restli-query.js";

vi.mock("../../src/services/linkedin/linkedin-http-client.js", () => ({
  LinkedInHttpClient: {
    encodeUrn: vi.fn((urn: string) => encodeURIComponent(urn)),
  },
}));

const mockHttpClient = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
const mockRateLimiter = { consume: vi.fn().mockResolvedValue(undefined), destroy: vi.fn() };

// The expected query strings below are the "Encoded Sample Request" lines from
// LinkedIn's pages, read 2026-10-01 (ads-targeting, ad-supply-forecasts,
// audience-counts, ad-preview). The sample lines are compared as a set of
// `key=value` pairs: LinkedIn does not document parameter order.
function pairs(query: string): string[] {
  return query.split("&").sort();
}

function lastGet(): { path: string; query: string } {
  const [path, params] = mockHttpClient.get.mock.calls.at(-1)!;
  return { path, query: params ? encodeRestliQuery(params) : "" };
}

describe("LinkedIn targeting, forecast, audience-count and preview requests", () => {
  let service: LinkedInService;

  beforeEach(() => {
    service = new LinkedInService(mockRateLimiter as any, mockHttpClient as any);
    mockHttpClient.get.mockReset().mockResolvedValue({ elements: [] });
    mockHttpClient.post.mockReset();
    mockRateLimiter.consume.mockReset().mockResolvedValue(undefined);
  });

  describe("listTargetingFacets()", () => {
    it("is a plain GET on /rest/adTargetingFacets with no finder and no parameters", async () => {
      await service.listTargetingFacets();
      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
      const { path, query } = lastGet();
      expect(path).toBe("/rest/adTargetingFacets");
      expect(query).toBe("");
      expect(mockRateLimiter.consume).toHaveBeenCalled();
    });
  });

  describe("getTargetingEntities()", () => {
    it("browses a facet with q=adTargetingFacet", async () => {
      await service.getTargetingEntities({
        finder: "adTargetingFacet",
        facet: "seniorities",
        locale: { language: "en", country: "US" },
      });
      const { path, query } = lastGet();
      expect(path).toBe("/rest/adTargetingEntities");
      expect(pairs(query)).toEqual(
        pairs(
          "q=adTargetingFacet&queryVersion=QUERY_USES_URNS&facet=urn%3Ali%3AadTargetingFacet%3Aseniorities&locale=(language:en,country:US)"
        )
      );
    });

    it("searches a facet with q=typeahead", async () => {
      await service.getTargetingEntities({
        finder: "typeahead",
        facet: "fieldsOfStudy",
        query: "econ",
        entityType: "FIELD_OF_STUDY",
        locale: { language: "en", country: "US" },
      });
      const { query } = lastGet();
      expect(pairs(query)).toEqual(
        pairs(
          "q=typeahead&entityType=FIELD_OF_STUDY&queryVersion=QUERY_USES_URNS&facet=urn%3Ali%3AadTargetingFacet%3AfieldsOfStudy&query=econ&locale=(language:en,country:US)"
        )
      );
    });

    it("finds similar entities with q=similarEntities and a List of URNs", async () => {
      await service.getTargetingEntities({
        finder: "similarEntities",
        facet: "employers",
        entities: ["urn:li:organization:1003"],
        locale: { language: "en", country: "US" },
      });
      const { query } = lastGet();
      expect(pairs(query)).toEqual(
        pairs(
          "q=similarEntities&facet=urn%3Ali%3AadTargetingFacet%3Aemployers&queryVersion=QUERY_USES_URNS&entities=List(urn%3Ali%3Aorganization%3A1003)&locale=(language:en,country:US)"
        )
      );
    });

    it("resolves URNs with q=urns, which takes no facet", async () => {
      await service.getTargetingEntities({
        finder: "urns",
        urns: ["urn:li:geo:102095887", "urn:li:geo:101857797"],
        locale: { language: "en", country: "US" },
      });
      const { query } = lastGet();
      expect(pairs(query)).toEqual(
        pairs(
          "q=urns&queryVersion=QUERY_USES_URNS&urns=List(urn%3Ali%3Ageo%3A102095887,urn%3Ali%3Ageo%3A101857797)&locale=(language:en,country:US)"
        )
      );
    });

    it("sends no locale unless asked, since LinkedIn defaults it to en_US", async () => {
      await service.getTargetingEntities({ finder: "adTargetingFacet", facet: "genders" });
      expect(lastGet().query).not.toContain("locale");
    });

    it("does not send start or count, which LinkedIn documents for none of these finders", async () => {
      await service.getTargetingEntities({ finder: "adTargetingFacet", facet: "genders" });
      expect(lastGet().query).not.toMatch(/start=|count=/);
    });

    it("refuses to browse a typeahead-only facet and says to search it", async () => {
      await expect(
        service.getTargetingEntities({ finder: "adTargetingFacet", facet: "locations" })
      ).rejects.toThrow(/typeahead/);
      expect(mockHttpClient.get).not.toHaveBeenCalled();
    });

    it("refuses to search a browse-only facet", async () => {
      await expect(
        service.getTargetingEntities({ finder: "typeahead", facet: "seniorities", query: "x" })
      ).rejects.toThrow(/adTargetingFacet/);
    });

    it("refuses a facet LinkedIn retired", async () => {
      await expect(
        service.getTargetingEntities({ finder: "typeahead", facet: "geos", query: "uk" })
      ).rejects.toThrow(/locations/);
    });
  });

  describe("getAudienceCount()", () => {
    it("GETs /rest/audienceCounts with q=targetingCriteriaV2", async () => {
      await service.getAudienceCount({
        include: {
          and: [
            { or: { "urn:li:adTargetingFacet:locations": ["urn:li:geo:102221843"] } },
            { or: { "urn:li:adTargetingFacet:skills": ["urn:li:skill:17"] } },
          ],
        },
      });
      const { path, query } = lastGet();
      expect(path).toBe("/rest/audienceCounts");
      expect(query).toBe(
        "q=targetingCriteriaV2&targetingCriteria=(include:(and:List((or:(urn%3Ali%3AadTargetingFacet%3Alocations:List(urn%3Ali%3Ageo%3A102221843))),(or:(urn%3Ali%3AadTargetingFacet%3Askills:List(urn%3Ali%3Askill%3A17))))))"
      );
    });
  });

  describe("getAdSupplyForecast()", () => {
    it("GETs /rest/adSupplyForecasts?q=criteriaV2, not the legacy POST /v2/adForecastsV2", async () => {
      await service.getAdSupplyForecast({
        account: "urn:li:sponsoredAccount:507001111",
        campaignType: "SPONSORED_UPDATES",
        timeRange: { start: 1566284400000, end: 1568962800000 },
        totalBudget: { amount: "100.00", currencyCode: "USD" },
        competingBid: { bidType: "CPM", bidPrice: { currencyCode: "USD", amount: "10" } },
        targetingCriteria: {
          include: {
            and: [{ or: { "urn:li:adTargetingFacet:locations": ["urn:li:geo:101165590"] } }],
          },
          exclude: {
            or: {
              "urn:li:adTargetingFacet:staffCountRanges": [
                "urn:li:staffCountRange:(10001,2147483647)",
              ],
            },
          },
        },
      });
      expect(mockHttpClient.post).not.toHaveBeenCalled();
      const { path, query } = lastGet();
      expect(path).toBe("/rest/adSupplyForecasts");
      expect(pairs(query)).toEqual(
        pairs(
          "q=criteriaV2&account=urn%3Ali%3AsponsoredAccount%3A507001111&timeRange=(start:1566284400000,end:1568962800000)&campaignType=SPONSORED_UPDATES&totalBudget=(amount:100.00,currencyCode:USD)&competingBid=(bidType:CPM,bidPrice:(currencyCode:USD,amount:10))&targetingCriteria=(include:(and:List((or:(urn%3Ali%3AadTargetingFacet%3Alocations:List(urn%3Ali%3Ageo%3A101165590))))),exclude:(or:(urn%3Ali%3AadTargetingFacet%3AstaffCountRanges:List(urn%3Ali%3AstaffCountRange%3A%2810001%2C2147483647%29))))"
        )
      );
    });

    it("sends the optional fields under the names LinkedIn documents", async () => {
      await service.getAdSupplyForecast({
        account: "urn:li:sponsoredAccount:1",
        campaignType: "SPONSORED_UPDATES",
        timeRange: { start: 1, end: 2 },
        dailyBudget: { amount: "300", currencyCode: "USD" },
        targetingCriteria: { include: { and: [] } },
        optimizationTarget: "MAX_CLICK",
        campaign: "urn:li:sponsoredCampaign:9",
        creativeType: "SPONSORED_VIDEO",
        objectiveType: "WEBSITE_VISIT",
        enableAudienceNetwork: true,
        enableAudienceExpansion: false,
        connectedTelevisionOnly: false,
        targetCost: "5.5",
        costCap: "7",
      });
      const params = mockHttpClient.get.mock.calls.at(-1)![1];
      expect(params).toMatchObject({
        q: "criteriaV2",
        dailyBudget: { amount: "300", currencyCode: "USD" },
        optimizationTarget: "MAX_CLICK",
        campaign: "urn:li:sponsoredCampaign:9",
        creativeType: "SPONSORED_VIDEO",
        objectiveType: "WEBSITE_VISIT",
        enableAudienceNetwork: true,
        enableAudienceExpansion: false,
        connectedTelevisionOnly: false,
        targetCost: "5.5",
        costCap: "7",
      });
      expect(params).not.toHaveProperty("optimizationTargetType");
    });

    it("leaves out what the caller did not give", async () => {
      await service.getAdSupplyForecast({
        account: "urn:li:sponsoredAccount:1",
        campaignType: "DYNAMIC",
        timeRange: { start: 1, end: 2 },
        totalBudget: { amount: "1", currencyCode: "USD" },
        targetingCriteria: { include: { and: [] } },
      });
      const { query } = lastGet();
      for (const absent of ["dailyBudget", "competingBid", "optimizationTarget", "campaign"]) {
        expect(query, absent).not.toContain(`${absent}=`);
      }
    });
  });

  describe("getAdPreviews()", () => {
    it("GETs /rest/adPreviews?q=creative with the creative and its account", async () => {
      await service.getAdPreviews(
        "urn:li:sponsoredCreative:123456789",
        "urn:li:sponsoredAccount:123456789"
      );
      const { path, query } = lastGet();
      expect(path).toBe("/rest/adPreviews");
      expect(pairs(query)).toEqual(
        pairs(
          "q=creative&creative=urn%3Ali%3AsponsoredCreative%3A123456789&account=urn%3Ali%3AsponsoredAccount%3A123456789"
        )
      );
    });

    it("no longer calls the legacy /v2/adCreativePreviews/{urn} path", async () => {
      await service.getAdPreviews("urn:li:sponsoredCreative:1", "urn:li:sponsoredAccount:2");
      expect(lastGet().path).not.toContain("/v2/");
    });
  });
});
