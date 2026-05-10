import { beforeEach, describe, expect, it, vi } from "vitest";
import { LinkedInReportingService } from "../../src/services/linkedin/linkedin-reporting-service.js";

const mockRateLimiter = {
  consume: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn(),
};

const mockHttpClient = {
  get: vi.fn(),
};

describe("LinkedInReportingService", () => {
  let service: LinkedInReportingService;

  beforeEach(() => {
    service = new LinkedInReportingService(mockRateLimiter as any, mockHttpClient as any);
    vi.clearAllMocks();
  });

  it("builds analytics query and returns parsed elements", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      elements: [{ impressions: 100, clicks: 10 }],
      paging: { total: 1 },
    });

    const result = await service.getAnalytics(
      "urn:li:sponsoredAccount:123",
      { start: "2026-03-01", end: "2026-03-04" },
      ["impressions", "clicks"],
      "CAMPAIGN",
      "DAILY"
    );

    expect(result.elements).toHaveLength(1);
    const [path, params] = mockHttpClient.get.mock.calls[0];
    expect(path).toBe("/v2/adAnalytics");
    expect(params.pivot).toBe("CAMPAIGN");
    expect(params.timeGranularity).toBe("DAILY");
    expect(params.fields).toContain("impressions");
    expect(mockRateLimiter.consume).toHaveBeenCalledWith("linkedin:urn:li:sponsoredAccount:123");
  });

  it("returns breakdown results for multiple pivots", async () => {
    mockHttpClient.get
      .mockResolvedValueOnce({ elements: [{ impressions: 100 }] })
      .mockResolvedValueOnce({ elements: [{ impressions: 200 }] });

    const result = await service.getAnalyticsBreakdowns(
      "urn:li:sponsoredAccount:123",
      { start: "2026-03-01", end: "2026-03-04" },
      ["CAMPAIGN", "CREATIVE"]
    );

    expect(result.results).toHaveLength(2);
    expect(result.results[0].pivot).toBe("CAMPAIGN");
    expect(result.results[1].pivot).toBe("CREATIVE");
  });

  it("preserves account URN and member pivot filters in analytics query params", async () => {
    mockHttpClient.get.mockResolvedValueOnce({ elements: [] });

    await service.getAnalytics(
      "urn:li:sponsoredAccount:987654",
      { start: "2026-04-01", end: "2026-04-30" },
      ["impressions", "videoViews"],
      "MEMBER_JOB_FUNCTION",
      "MONTHLY"
    );

    const [, params] = mockHttpClient.get.mock.calls[0];
    expect(params["accounts[0]"]).toBe("urn:li:sponsoredAccount:987654");
    expect(params.pivot).toBe("MEMBER_JOB_FUNCTION");
    expect(params.timeGranularity).toBe("MONTHLY");
    expect(params.fields).toBe("impressions,videoViews");
    expect(params["dateRange.start.month"]).toBe("4");
    expect(params["dateRange.end.day"]).toBe("30");
  });

  it("throws on invalid date format", async () => {
    await expect(
      service.getAnalytics("urn:li:sponsoredAccount:123", {
        start: "invalid-date",
        end: "2026-03-04",
      })
    ).rejects.toThrow("Invalid date format");
  });

  it("throws on non-YYYY-MM-DD date strings", async () => {
    await expect(
      service.getAnalytics("urn:li:sponsoredAccount:123", { start: "2026-3-4", end: "2026-03-04" })
    ).rejects.toThrow('Invalid date format: "2026-3-4". Expected YYYY-MM-DD.');
  });

  it("throws on datetime strings even if the calendar date is real", async () => {
    await expect(
      service.getAnalytics("urn:li:sponsoredAccount:123", {
        start: "2026-03-04T12:00:00Z",
        end: "2026-03-04",
      })
    ).rejects.toThrow('Invalid date format: "2026-03-04T12:00:00Z". Expected YYYY-MM-DD.');
  });

  it("throws on impossible calendar dates", async () => {
    await expect(
      service.getAnalytics("urn:li:sponsoredAccount:123", {
        start: "2026-02-30",
        end: "2026-03-04",
      })
    ).rejects.toThrow('Invalid date: "2026-02-30" does not represent a real calendar date.');
  });
});
