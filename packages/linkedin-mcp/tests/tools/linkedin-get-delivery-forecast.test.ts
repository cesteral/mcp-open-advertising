import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(),
}));

import { resolveSessionServices } from "../../src/mcp-server/tools/utils/resolve-session.js";
const mockResolveSessionServices = vi.mocked(resolveSessionServices);

import {
  GetDeliveryForecastInputSchema,
  getDeliveryForecastLogic,
  getDeliveryForecastTool,
} from "../../src/mcp-server/tools/definitions/get-delivery-forecast.tool.js";

const mockLinkedInService = { getAdSupplyForecast: vi.fn() };
const mockContext = { requestId: "test-req-id", operationId: "test-op-id" };

// Ad Supply Forecasts page, read 2026-10-01: GET /rest/adSupplyForecasts?q=criteriaV2
// needs account, campaignType, timeRange (epoch ms), targetingCriteria, and
// dailyBudget or totalBudget. The response is impressions/clicks/spend metrics by
// granularity — it does not return an audience size.

const targetingCriteria = {
  include: {
    and: [{ or: { "urn:li:adTargetingFacet:locations": ["urn:li:geo:103644278"] } }],
  },
};

const valid = {
  adAccountUrn: "urn:li:sponsoredAccount:507001111",
  campaignType: "SPONSORED_UPDATES",
  startTime: "2030-01-01T00:00:00.000Z",
  endTime: "2030-01-31T00:00:00.000Z",
  targetingCriteria,
  dailyBudget: { amount: "300", currencyCode: "USD" },
};

describe("linkedin_get_delivery_forecast tool", () => {
  beforeEach(() => {
    mockLinkedInService.getAdSupplyForecast.mockReset();
    mockResolveSessionServices.mockReturnValue({
      httpClient: {} as any,
      linkedInService: mockLinkedInService as any,
      linkedInReportingService: {} as any,
    } as any);
  });

  describe("input schema", () => {
    const parse = (input: unknown) => GetDeliveryForecastInputSchema.safeParse(input);

    it("accepts a complete request", () => {
      expect(parse(valid).success).toBe(true);
    });

    it("requires a campaign type, and only LinkedIn's three", () => {
      const { campaignType: _omit, ...without } = valid;
      expect(parse(without).success).toBe(false);
      expect(parse({ ...valid, campaignType: "TEXT_AD" }).success).toBe(false);
      for (const ok of ["SPONSORED_UPDATES", "SPONSORED_INMAILS", "DYNAMIC"]) {
        expect(parse({ ...valid, campaignType: ok }).success, ok).toBe(true);
      }
    });

    it("requires a time range", () => {
      const { startTime: _s, ...noStart } = valid;
      const { endTime: _e, ...noEnd } = valid;
      expect(parse(noStart).success).toBe(false);
      expect(parse(noEnd).success).toBe(false);
    });

    it("requires the end to be after the start", () => {
      expect(parse({ ...valid, endTime: valid.startTime }).success).toBe(false);
      expect(parse({ ...valid, endTime: "2029-01-01T00:00:00.000Z" }).success).toBe(false);
    });

    it("requires a daily or a total budget", () => {
      const { dailyBudget: _d, ...none } = valid;
      expect(parse(none).success).toBe(false);
      expect(parse({ ...none, totalBudget: { amount: "1000", currencyCode: "USD" } }).success).toBe(
        true
      );
    });

    it("takes a budget amount as a real-number string with an ISO currency code", () => {
      expect(parse({ ...valid, dailyBudget: { amount: "abc", currencyCode: "USD" } }).success).toBe(
        false
      );
      expect(
        parse({ ...valid, dailyBudget: { amount: "300", currencyCode: "dollars" } }).success
      ).toBe(false);
    });

    it("takes a competing bid as LinkedIn documents it", () => {
      expect(
        parse({
          ...valid,
          competingBid: { bidType: "CPM", bidPrice: { amount: "10", currencyCode: "USD" } },
        }).success
      ).toBe(true);
      expect(
        parse({
          ...valid,
          competingBid: { bidType: "CPA", bidPrice: { amount: "10", currencyCode: "USD" } },
        }).success
      ).toBe(false);
    });

    it("rejects targeting that names a facet LinkedIn retired", () => {
      const result = parse({
        ...valid,
        targetingCriteria: {
          include: { and: [{ or: { "urn:li:adTargetingFacet:geos": ["urn:li:geo:1"] } }] },
        },
      });
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toMatch(/locations/);
    });

    it("calls the optimization field optimizationTarget, as LinkedIn does", () => {
      const shape = GetDeliveryForecastInputSchema._def.schema.shape;
      expect(shape).toHaveProperty("optimizationTarget");
      expect(shape).not.toHaveProperty("optimizationTargetType");
    });
  });

  describe("getDeliveryForecastLogic()", () => {
    it("sends the ISO times as epoch milliseconds and the account as `account`", async () => {
      mockLinkedInService.getAdSupplyForecast.mockResolvedValueOnce({ elements: [] });
      await getDeliveryForecastLogic(valid as any, mockContext as any);
      expect(mockLinkedInService.getAdSupplyForecast).toHaveBeenCalledWith(
        expect.objectContaining({
          account: "urn:li:sponsoredAccount:507001111",
          campaignType: "SPONSORED_UPDATES",
          timeRange: { start: Date.parse(valid.startTime), end: Date.parse(valid.endTime) },
          dailyBudget: { amount: "300", currencyCode: "USD" },
          targetingCriteria,
        }),
        mockContext
      );
    });

    it("returns LinkedIn's response under `forecast`", async () => {
      const response = {
        elements: [{ metricType: "IMPRESSION", granularity: "DAILY", timeSeries: [] }],
      };
      mockLinkedInService.getAdSupplyForecast.mockResolvedValueOnce(response);
      const result = await getDeliveryForecastLogic(valid as any, mockContext as any);
      expect(result.forecast).toEqual(response);
      expect(result.adAccountUrn).toBe(valid.adAccountUrn);
    });
  });

  it("no longer claims the forecast returns an audience size, and names the tool that does", () => {
    expect(getDeliveryForecastTool.description).not.toMatch(/returns[^.]*audience size/i);
    expect(getDeliveryForecastTool.description).toMatch(/does not return an audience size/);
    expect(getDeliveryForecastTool.description).toContain("linkedin_get_audience_count");
  });

  it("no longer teaches the retired facet and value URNs in its examples", () => {
    const text = JSON.stringify(getDeliveryForecastTool.inputExamples);
    for (const bad of ["adTargetingFacet:geos", "memberSeniorities", "adSeniority"]) {
      expect(text, bad).not.toContain(bad);
    }
  });
});
