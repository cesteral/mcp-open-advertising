// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(),
}));

import { resolveSessionServices } from "../../src/mcp-server/tools/utils/resolve-session.js";
const mockResolveSessionServices = vi.mocked(resolveSessionServices);

import {
  getAnalyticsLogic,
  getAnalyticsResponseFormatter,
} from "../../src/mcp-server/tools/definitions/get-analytics.tool.js";
import {
  getAnalyticsBreakdownsLogic,
  getAnalyticsBreakdownsResponseFormatter,
} from "../../src/mcp-server/tools/definitions/get-analytics-breakdowns.tool.js";

const mockReportingService = {
  getAnalytics: vi.fn(),
  getAnalyticsBreakdowns: vi.fn(),
};

const mockSessionServices = {
  httpClient: {} as any,
  linkedInService: {} as any,
  linkedInReportingService: mockReportingService as any,
};

const mockContext = {
  requestId: "test-req-id",
  operationId: "test-op-id",
};

const URN = "urn:li:sponsoredAccount:123456789";

describe("linkedin_get_analytics tool", () => {
  beforeEach(() => {
    mockReportingService.getAnalytics.mockReset();
    mockReportingService.getAnalyticsBreakdowns.mockReset();
    mockResolveSessionServices.mockReturnValue(mockSessionServices as any);
  });

  describe("getAnalyticsLogic()", () => {
    it("forwards explicit startDate/endDate to the service", async () => {
      mockReportingService.getAnalytics.mockResolvedValueOnce({ elements: [] });

      const result = await getAnalyticsLogic(
        {
          adAccountUrn: URN,
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          metrics: ["impressions", "clicks"],
          pivot: "CAMPAIGN",
          timeGranularity: "DAILY",
        } as any,
        mockContext as any
      );

      expect(mockReportingService.getAnalytics).toHaveBeenCalledWith(
        URN,
        { start: "2026-01-01", end: "2026-01-31" },
        ["impressions", "clicks"],
        "CAMPAIGN",
        "DAILY",
        mockContext
      );
      expect(result.dateRange).toEqual({ start: "2026-01-01", end: "2026-01-31" });
    });

    it("resolves datePreset to a concrete date range before calling the service", async () => {
      mockReportingService.getAnalytics.mockResolvedValueOnce({ elements: [] });

      const result = await getAnalyticsLogic(
        { adAccountUrn: URN, datePreset: "LAST_7_DAYS" } as any,
        mockContext as any
      );

      const call = mockReportingService.getAnalytics.mock.calls[0];
      const dateArg = call[1] as { start: string; end: string };
      expect(dateArg.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(dateArg.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(dateArg.start).getTime()).toBeLessThanOrEqual(
        new Date(dateArg.end).getTime()
      );
      expect(result.dateRange).toEqual(dateArg);
    });

    it("defaults pivot to CAMPAIGN and timeGranularity to DAILY in the output", async () => {
      mockReportingService.getAnalytics.mockResolvedValueOnce({ elements: [] });

      const result = await getAnalyticsLogic(
        { adAccountUrn: URN, startDate: "2026-01-01", endDate: "2026-01-31" } as any,
        mockContext as any
      );

      expect(result.pivot).toBe("CAMPAIGN");
      expect(result.timeGranularity).toBe("DAILY");
    });

    it("stringifies non-string element values so the bounded view can consume them", async () => {
      mockReportingService.getAnalytics.mockResolvedValueOnce({
        elements: [
          {
            impressions: 1234,
            clicks: 56,
            costInUsd: { currencyCode: "USD", amount: "12.34" },
            campaign: "urn:li:sponsoredCampaign:1",
            nullField: null,
          },
        ],
      });

      const result = await getAnalyticsLogic(
        { adAccountUrn: URN, startDate: "2026-01-01", endDate: "2026-01-31" } as any,
        mockContext as any
      );

      const row = (result.previewRows ?? result.rows)![0]!;
      expect(row.impressions).toBe("1234");
      expect(row.clicks).toBe("56");
      expect(row.costInUsd).toBe(JSON.stringify({ currencyCode: "USD", amount: "12.34" }));
      expect(row.campaign).toBe("urn:li:sponsoredCampaign:1");
      expect(row.nullField).toBe("");
    });

    it("appends computed metrics when includeComputedMetrics is true", async () => {
      mockReportingService.getAnalytics.mockResolvedValueOnce({
        elements: [{ impressions: 1000, clicks: 25, costInUsd: 50 }],
      });

      const result = await getAnalyticsLogic(
        {
          adAccountUrn: URN,
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          includeComputedMetrics: true,
        } as any,
        mockContext as any
      );

      const row = (result.previewRows ?? result.rows)![0]!;
      // CTR = clicks/impressions*100 = 2.5
      expect(row.ctr).toBe("2.5");
      // CPC = cost/clicks = 50/25 = 2
      expect(row.cpc).toBe("2");
      // CPM = cost/impressions*1000 = 50
      expect(row.cpm).toBe("50");
    });

    it("does not append computed metrics by default", async () => {
      mockReportingService.getAnalytics.mockResolvedValueOnce({
        elements: [{ impressions: 1000, clicks: 25, costInUsd: 50 }],
      });

      const result = await getAnalyticsLogic(
        { adAccountUrn: URN, startDate: "2026-01-01", endDate: "2026-01-31" } as any,
        mockContext as any
      );

      const row = (result.previewRows ?? result.rows)![0]!;
      expect(row).not.toHaveProperty("ctr");
      expect(row).not.toHaveProperty("cpc");
      expect(row).not.toHaveProperty("cpm");
    });

    it("handles an empty elements array", async () => {
      mockReportingService.getAnalytics.mockResolvedValueOnce({ elements: [] });

      const result = await getAnalyticsLogic(
        { adAccountUrn: URN, startDate: "2026-01-01", endDate: "2026-01-31" } as any,
        mockContext as any
      );

      expect(result.totalRows).toBe(0);
      expect(result.previewRows ?? result.rows ?? []).toHaveLength(0);
    });

    it("propagates service errors", async () => {
      mockReportingService.getAnalytics.mockRejectedValueOnce(
        new Error("LinkedIn API error: 401 unauthorized")
      );

      await expect(
        getAnalyticsLogic(
          { adAccountUrn: URN, startDate: "2026-01-01", endDate: "2026-01-31" } as any,
          mockContext as any
        )
      ).rejects.toThrow("LinkedIn API error: 401 unauthorized");
    });
  });

  describe("getAnalyticsResponseFormatter()", () => {
    it("includes pivot, granularity, and date range in the header", () => {
      const formatted = getAnalyticsResponseFormatter({
        totalRows: 1,
        returnedRows: 1,
        truncated: false,
        nextOffset: null,
        headers: ["impressions"],
        selectedColumns: ["impressions"],
        mode: "summary",
        previewRows: [{ impressions: "100" }],
        warnings: [],
        pivot: "CAMPAIGN_GROUP",
        timeGranularity: "MONTHLY",
        dateRange: { start: "2026-01-01", end: "2026-03-01" },
        timestamp: "2026-03-04T00:00:00.000Z",
      } as any);

      const text = (formatted[0] as { type: string; text: string }).text;
      expect(text).toContain("CAMPAIGN_GROUP");
      expect(text).toContain("MONTHLY");
      expect(text).toContain("2026-01-01 to 2026-03-01");
      expect(text).toContain("2026-03-04T00:00:00.000Z");
    });
  });
});

describe("linkedin_get_analytics_breakdowns tool", () => {
  beforeEach(() => {
    mockReportingService.getAnalytics.mockReset();
    mockReportingService.getAnalyticsBreakdowns.mockReset();
    mockResolveSessionServices.mockReturnValue(mockSessionServices as any);
  });

  describe("getAnalyticsBreakdownsLogic()", () => {
    it("returns one result entry per pivot with the original pivot label", async () => {
      mockReportingService.getAnalyticsBreakdowns.mockResolvedValueOnce({
        results: [
          { pivot: "CAMPAIGN", elements: [{ impressions: 100 }, { impressions: 200 }] },
          { pivot: "MEMBER_COUNTRY", elements: [{ impressions: 50 }] },
        ],
      });

      const result = await getAnalyticsBreakdownsLogic(
        {
          adAccountUrn: URN,
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          pivots: ["CAMPAIGN", "MEMBER_COUNTRY"],
        } as any,
        mockContext as any
      );

      expect(result.results).toHaveLength(2);
      expect(result.results[0]!.pivot).toBe("CAMPAIGN");
      expect(result.results[0]!.count).toBe(2);
      expect(result.results[1]!.pivot).toBe("MEMBER_COUNTRY");
      expect(result.results[1]!.count).toBe(1);
    });

    it("resolves datePreset before calling the service", async () => {
      mockReportingService.getAnalyticsBreakdowns.mockResolvedValueOnce({ results: [] });

      await getAnalyticsBreakdownsLogic(
        { adAccountUrn: URN, datePreset: "LAST_30_DAYS", pivots: ["CAMPAIGN"] } as any,
        mockContext as any
      );

      const call = mockReportingService.getAnalyticsBreakdowns.mock.calls[0];
      const dateArg = call[1] as { start: string; end: string };
      expect(dateArg.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(dateArg.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("stringifies non-string element values per pivot", async () => {
      mockReportingService.getAnalyticsBreakdowns.mockResolvedValueOnce({
        results: [
          {
            pivot: "CAMPAIGN",
            elements: [{ impressions: 1234, costInUsd: { amount: "10" }, nullField: null }],
          },
        ],
      });

      const result = await getAnalyticsBreakdownsLogic(
        {
          adAccountUrn: URN,
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          pivots: ["CAMPAIGN"],
        } as any,
        mockContext as any
      );

      const row = result.results[0]!.elements[0] as Record<string, unknown>;
      expect(row.impressions).toBe("1234");
      expect(row.costInUsd).toBe(JSON.stringify({ amount: "10" }));
      expect(row.nullField).toBe("");
    });

    it("appends computed metrics per pivot when includeComputedMetrics is true", async () => {
      mockReportingService.getAnalyticsBreakdowns.mockResolvedValueOnce({
        results: [
          { pivot: "CAMPAIGN", elements: [{ impressions: 1000, clicks: 25, costInUsd: 50 }] },
        ],
      });

      const result = await getAnalyticsBreakdownsLogic(
        {
          adAccountUrn: URN,
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          pivots: ["CAMPAIGN"],
          includeComputedMetrics: true,
        } as any,
        mockContext as any
      );

      const row = result.results[0]!.elements[0] as Record<string, unknown>;
      expect(row.ctr).toBe("2.5");
      expect(row.cpc).toBe("2");
      expect(row.cpm).toBe("50");
    });

    it("propagates service errors", async () => {
      mockReportingService.getAnalyticsBreakdowns.mockRejectedValueOnce(
        new Error("LinkedIn API error: 429 throttled")
      );

      await expect(
        getAnalyticsBreakdownsLogic(
          {
            adAccountUrn: URN,
            startDate: "2026-01-01",
            endDate: "2026-01-31",
            pivots: ["CAMPAIGN"],
          } as any,
          mockContext as any
        )
      ).rejects.toThrow("LinkedIn API error: 429 throttled");
    });
  });

  describe("getAnalyticsBreakdownsResponseFormatter()", () => {
    it("renders one section per pivot with row counts", () => {
      const formatted = getAnalyticsBreakdownsResponseFormatter({
        results: [
          { pivot: "CAMPAIGN", elements: [{ id: "1" }, { id: "2" }], count: 2 },
          { pivot: "MEMBER_COUNTRY", elements: [{ country: "US" }], count: 1 },
        ],
        dateRange: { start: "2026-01-01", end: "2026-01-31" },
        timestamp: "2026-03-04T00:00:00.000Z",
      } as any);

      const text = (formatted[0] as { type: string; text: string }).text;
      expect(text).toContain("## CAMPAIGN (2 rows)");
      expect(text).toContain("## MEMBER_COUNTRY (1 rows)");
      expect(text).toContain("2026-01-01 to 2026-01-31");
      expect(text).toContain("2026-03-04T00:00:00.000Z");
    });
  });
});
