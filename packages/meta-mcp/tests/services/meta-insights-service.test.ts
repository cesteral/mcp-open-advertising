import { describe, it, expect, vi, beforeEach } from "vitest";
import { MetaInsightsService } from "../../src/services/meta/meta-insights-service.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockHttpClient() {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  } as any;
}

function createMockRateLimiter() {
  return {
    consume: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MetaInsightsService", () => {
  let service: MetaInsightsService;
  let httpClient: ReturnType<typeof createMockHttpClient>;
  let rateLimiter: ReturnType<typeof createMockRateLimiter>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    httpClient = createMockHttpClient();
    rateLimiter = createMockRateLimiter();
    logger = createMockLogger();
    service = new MetaInsightsService(rateLimiter, httpClient, logger);
  });

  // ==========================================================================
  // getInsights
  // ==========================================================================

  describe("getInsights", () => {
    it("rejects when both datePreset and timeRange are provided", async () => {
      await expect(
        service.getInsights("campaign-123", {
          datePreset: "last_30d",
          timeRange: { since: "2025-01-01", until: "2025-01-31" },
        })
      ).rejects.toThrow("Cannot specify both datePreset and timeRange");
    });

    it("calls httpClient.get with /{entityId}/insights path", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getInsights("campaign-123", {});

      expect(httpClient.get).toHaveBeenCalledTimes(1);
      const [path] = httpClient.get.mock.calls[0];
      expect(path).toBe("/campaign-123/insights");
    });

    it("uses default fields when none provided", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getInsights("campaign-123", {});

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.fields).toContain("impressions");
      expect(params.fields).toContain("clicks");
      expect(params.fields).toContain("spend");
      expect(params.fields).toContain("cpc");
      expect(params.fields).toContain("cpm");
      expect(params.fields).toContain("ctr");
    });

    it("uses custom fields when provided", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getInsights("campaign-123", {
        fields: ["impressions", "clicks"],
      });

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.fields).toBe("impressions,clicks");
    });

    it("passes datePreset as date_preset query param", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getInsights("campaign-123", {
        datePreset: "last_30d",
      });

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.date_preset).toBe("last_30d");
    });

    it("passes timeRange as JSON string", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      const timeRange = { since: "2025-01-01", until: "2025-01-31" };
      await service.getInsights("campaign-123", { timeRange });

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.time_range).toBe(JSON.stringify(timeRange));
    });

    it("passes timeIncrement as time_increment", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getInsights("campaign-123", {
        timeIncrement: "1",
      });

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.time_increment).toBe("1");
    });

    it("passes level param", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getInsights("campaign-123", {
        level: "adset",
      });

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.level).toBe("adset");
    });

    it("passes limit as string", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getInsights("campaign-123", {
        limit: 100,
      });

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.limit).toBe("100");
    });

    it("passes after cursor", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getInsights("campaign-123", {
        after: "cursor-abc",
      });

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.after).toBe("cursor-abc");
    });

    it("returns data from response", async () => {
      const insightsData = [{ impressions: "1000", clicks: "50", spend: "25.00" }];
      httpClient.get.mockResolvedValueOnce({ data: insightsData });

      const result = await service.getInsights("campaign-123", {});

      expect(result.data).toEqual(insightsData);
    });

    it("returns nextCursor from paging.cursors.after", async () => {
      httpClient.get.mockResolvedValueOnce({
        data: [{ impressions: "100" }],
        paging: { cursors: { before: "abc", after: "xyz" } },
      });

      const result = await service.getInsights("campaign-123", {});

      expect(result.nextCursor).toBe("xyz");
    });

    it("returns undefined nextCursor when no paging", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      const result = await service.getInsights("campaign-123", {});

      expect(result.nextCursor).toBeUndefined();
    });

    it("returns summary from response", async () => {
      const summary = { total_impressions: "5000" };
      httpClient.get.mockResolvedValueOnce({ data: [], summary });

      const result = await service.getInsights("campaign-123", {});

      expect(result.summary).toEqual(summary);
    });

    it("returns empty data array when data is missing", async () => {
      httpClient.get.mockResolvedValueOnce({});

      const result = await service.getInsights("campaign-123", {});

      expect(result.data).toEqual([]);
    });

    it("calls rateLimiter.consume with default key", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getInsights("campaign-123", {});

      expect(rateLimiter.consume).toHaveBeenCalledWith("meta:default");
    });

    it("does not include optional params when not provided", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getInsights("campaign-123", {});

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.date_preset).toBeUndefined();
      expect(params.time_range).toBeUndefined();
      expect(params.time_increment).toBeUndefined();
      expect(params.level).toBeUndefined();
      expect(params.limit).toBeUndefined();
      expect(params.after).toBeUndefined();
    });
  });

  // ==========================================================================
  // getInsightsBreakdowns
  // ==========================================================================

  describe("getInsightsBreakdowns", () => {
    it("rejects when both datePreset and timeRange are provided", async () => {
      await expect(
        service.getInsightsBreakdowns("campaign-123", {
          breakdowns: ["age"],
          datePreset: "last_7d",
          timeRange: { since: "2025-01-01", until: "2025-01-31" },
        })
      ).rejects.toThrow("Cannot specify both datePreset and timeRange");
    });

    it("calls httpClient.get with /{entityId}/insights path", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getInsightsBreakdowns("campaign-123", {
        breakdowns: ["age"],
      });

      expect(httpClient.get).toHaveBeenCalledTimes(1);
      const [path] = httpClient.get.mock.calls[0];
      expect(path).toBe("/campaign-123/insights");
    });

    it("passes breakdowns as comma-separated query param", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getInsightsBreakdowns("campaign-123", {
        breakdowns: ["age", "gender"],
      });

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.breakdowns).toBe("age,gender");
    });

    it("uses default fields when none provided", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getInsightsBreakdowns("campaign-123", {
        breakdowns: ["age"],
      });

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.fields).toContain("impressions");
      expect(params.fields).toContain("clicks");
      expect(params.fields).toContain("spend");
    });

    it("uses custom fields when provided", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getInsightsBreakdowns("campaign-123", {
        breakdowns: ["age"],
        fields: ["impressions", "spend"],
      });

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.fields).toBe("impressions,spend");
    });

    it("passes datePreset as date_preset", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getInsightsBreakdowns("campaign-123", {
        breakdowns: ["age"],
        datePreset: "last_7d",
      });

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.date_preset).toBe("last_7d");
    });

    it("passes timeRange as JSON string", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      const timeRange = { since: "2025-01-01", until: "2025-01-31" };
      await service.getInsightsBreakdowns("campaign-123", {
        breakdowns: ["age"],
        timeRange,
      });

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.time_range).toBe(JSON.stringify(timeRange));
    });

    it("passes timeIncrement", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getInsightsBreakdowns("campaign-123", {
        breakdowns: ["age"],
        timeIncrement: "monthly",
      });

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.time_increment).toBe("monthly");
    });

    it("passes level param", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getInsightsBreakdowns("campaign-123", {
        breakdowns: ["age"],
        level: "ad",
      });

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.level).toBe("ad");
    });

    it("passes limit as string", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getInsightsBreakdowns("campaign-123", {
        breakdowns: ["age"],
        limit: 50,
      });

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.limit).toBe("50");
    });

    it("passes after cursor", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getInsightsBreakdowns("campaign-123", {
        breakdowns: ["age"],
        after: "cursor-xyz",
      });

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.after).toBe("cursor-xyz");
    });

    it("passes actionAttributionWindows as comma-separated string", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getInsightsBreakdowns("campaign-123", {
        breakdowns: ["age"],
        actionAttributionWindows: ["1d_click", "7d_click"],
      });

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.action_attribution_windows).toBe("1d_click,7d_click");
    });

    it("does not pass actionAttributionWindows when empty", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getInsightsBreakdowns("campaign-123", {
        breakdowns: ["age"],
        actionAttributionWindows: [],
      });

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.action_attribution_windows).toBeUndefined();
    });

    it("returns data from response", async () => {
      const breakdownData = [
        { age: "25-34", impressions: "500", clicks: "25" },
        { age: "35-44", impressions: "300", clicks: "15" },
      ];
      httpClient.get.mockResolvedValueOnce({ data: breakdownData });

      const result = await service.getInsightsBreakdowns("campaign-123", {
        breakdowns: ["age"],
      });

      expect(result.data).toEqual(breakdownData);
    });

    it("returns nextCursor from paging.cursors.after", async () => {
      httpClient.get.mockResolvedValueOnce({
        data: [{ age: "25-34" }],
        paging: { cursors: { before: "abc", after: "xyz" } },
      });

      const result = await service.getInsightsBreakdowns("campaign-123", {
        breakdowns: ["age"],
      });

      expect(result.nextCursor).toBe("xyz");
    });

    it("returns undefined nextCursor when no paging", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      const result = await service.getInsightsBreakdowns("campaign-123", {
        breakdowns: ["age"],
      });

      expect(result.nextCursor).toBeUndefined();
    });

    it("returns empty data array when data is missing", async () => {
      httpClient.get.mockResolvedValueOnce({});

      const result = await service.getInsightsBreakdowns("campaign-123", {
        breakdowns: ["age"],
      });

      expect(result.data).toEqual([]);
    });

    it("calls rateLimiter.consume with default key", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getInsightsBreakdowns("campaign-123", {
        breakdowns: ["age"],
      });

      expect(rateLimiter.consume).toHaveBeenCalledWith("meta:default");
    });
  });

  describe("submitInsightsReport", () => {
    it("rejects when both datePreset and timeRange are provided", async () => {
      await expect(
        service.submitInsightsReport("campaign-123", {
          datePreset: "last_30d",
          timeRange: { since: "2025-01-01", until: "2025-01-31" },
        })
      ).rejects.toThrow("Cannot specify both datePreset and timeRange");
    });

    it("submits async insights requests with async=1", async () => {
      httpClient.post.mockResolvedValueOnce({ id: "report-123" });

      const result = await service.submitInsightsReport("campaign-123", {
        fields: ["impressions", "clicks"],
        datePreset: "last_30d",
      });

      expect(result).toEqual({ reportRunId: "report-123" });
      expect(httpClient.post).toHaveBeenCalledWith(
        "/campaign-123/insights",
        {
          fields: "impressions,clicks",
          async: 1,
          date_preset: "last_30d",
        },
        undefined
      );
    });
  });

  describe("getReportResults", () => {
    it("returns a single page and marks all rows fetched when no next cursor exists", async () => {
      httpClient.get.mockResolvedValueOnce({
        data: [{ id: "1" }, { id: "2" }],
      });

      const result = await service.getReportResults("report-123", { limit: 10 });

      expect(result).toEqual({
        data: [{ id: "1" }, { id: "2" }],
        fetchedAllRows: true,
        nextCursor: undefined,
      });
    });

    it("follows paging cursors until all rows are fetched", async () => {
      httpClient.get
        .mockResolvedValueOnce({
          data: [{ id: "1" }, { id: "2" }],
          paging: { cursors: { after: "cursor-2" } },
        })
        .mockResolvedValueOnce({
          data: [{ id: "3" }],
        });

      const result = await service.getReportResults("report-123", { limit: 10 });

      expect(result).toEqual({
        data: [{ id: "1" }, { id: "2" }, { id: "3" }],
        fetchedAllRows: true,
        nextCursor: undefined,
      });
      expect(httpClient.get).toHaveBeenNthCalledWith(
        1,
        "/report-123/insights",
        { limit: "10" },
        undefined
      );
      expect(httpClient.get).toHaveBeenNthCalledWith(
        2,
        "/report-123/insights",
        { limit: "8", after: "cursor-2" },
        undefined
      );
    });

    it("stops at the requested row limit and returns the continuation cursor", async () => {
      httpClient.get.mockResolvedValueOnce({
        data: [{ id: "1" }, { id: "2" }],
        paging: { cursors: { after: "cursor-2" } },
      });

      const result = await service.getReportResults("report-123", { limit: 2 });

      expect(result).toEqual({
        data: [{ id: "1" }, { id: "2" }],
        fetchedAllRows: false,
        nextCursor: "cursor-2",
      });
      expect(httpClient.get).toHaveBeenCalledTimes(1);
    });
  });
});
