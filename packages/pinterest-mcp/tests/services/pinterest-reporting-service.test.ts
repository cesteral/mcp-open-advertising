import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

import { PinterestReportingService } from "../../src/services/pinterest/pinterest-reporting-service.js";

const mockRateLimiter = {
  consume: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn(),
};

const mockLogger: any = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const mockHttpClient = {
  post: vi.fn(),
  get: vi.fn(),
  accountId: "ad-acct-123",
};

describe("PinterestReportingService", () => {
  let service: PinterestReportingService;

  beforeEach(() => {
    service = new PinterestReportingService(
      mockRateLimiter as any,
      mockHttpClient as any,
      mockLogger
    );
    vi.clearAllMocks();
  });

  it("submitReport sends create request to Pinterest v5 endpoint and returns task id", async () => {
    mockHttpClient.post.mockResolvedValueOnce({ token: "token-123" });

    const result = await service.submitReport({
      columns: ["IMPRESSION_1", "CLICKTHROUGH_1"],
      start_date: "2026-03-01",
      end_date: "2026-03-04",
    });

    expect(result.task_id).toBe("token-123");
    expect(mockHttpClient.post).toHaveBeenCalledWith(
      "/v5/ad_accounts/ad-acct-123/reports",
      expect.objectContaining({ columns: ["IMPRESSION_1", "CLICKTHROUGH_1"] }),
      undefined
    );
  });

  it("submitReport sends the v5 AdsAnalyticsCreateAsyncRequest shape (level, CSV, granularity)", async () => {
    mockHttpClient.post.mockResolvedValueOnce({ token: "token-123" });

    await service.submitReport({
      type: "AD_GROUP",
      columns: ["IMPRESSION_1"],
      start_date: "2026-03-01",
      end_date: "2026-03-04",
    });

    const body = mockHttpClient.post.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty("type");
    expect(body).toEqual({
      level: "AD_GROUP",
      report_format: "CSV",
      columns: ["IMPRESSION_1"],
      start_date: "2026-03-01",
      end_date: "2026-03-04",
      granularity: "DAY",
    });
  });

  it.each([
    ["CAMPAIGN", "CAMPAIGN"],
    ["AD_GROUP", "AD_GROUP"],
    ["AD", "PIN_PROMOTION"],
    ["KEYWORD", "KEYWORD"],
    ["ACCOUNT", "ADVERTISER"],
  ] as const)("maps report type %s to v5 level %s", async (type, level) => {
    mockHttpClient.post.mockResolvedValueOnce({ token: "t" });
    await service.submitReport({
      type,
      columns: ["IMPRESSION_1"],
      start_date: "2026-03-01",
      end_date: "2026-03-04",
      granularity: "TOTAL",
    });
    expect(mockHttpClient.post.mock.calls[0][1]).toMatchObject({ level, granularity: "TOTAL" });
  });

  it("pollReport treats CANCELLED as terminal (no polling forever)", async () => {
    mockHttpClient.get.mockResolvedValueOnce({ report_status: "CANCELLED" });

    const result = await service.pollReport("token-c");
    expect(result.report_status).toBe("CANCELLED");
    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
  });

  it("getReport throws on CANCELLED", async () => {
    mockHttpClient.post.mockResolvedValueOnce({ token: "token-c" });
    mockHttpClient.get.mockResolvedValueOnce({ report_status: "CANCELLED" });

    await expect(
      service.getReport({
        columns: ["IMPRESSION_1"],
        start_date: "2026-03-01",
        end_date: "2026-03-04",
      })
    ).rejects.toThrow(/CANCELLED/);
  });

  it("pollReport returns FINISHED result", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      report_status: "FINISHED",
      url: "https://example.com/report.csv",
    });

    const result = await service.pollReport("token-123");
    expect(result.report_status).toBe("FINISHED");
    expect(result.url).toContain("report.csv");
  });

  it("pollReport returns immediately on DOES_NOT_EXIST status", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      report_status: "DOES_NOT_EXIST",
    });

    const result = await service.pollReport("invalid-token");
    expect(result.report_status).toBe("DOES_NOT_EXIST");
    // Should not poll again — only one GET call
    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
  });

  it("getReport throws on DOES_NOT_EXIST status from pollReport", async () => {
    mockHttpClient.post.mockResolvedValueOnce({ token: "bad-token" });
    mockHttpClient.get.mockResolvedValueOnce({
      report_status: "DOES_NOT_EXIST",
    });

    await expect(
      service.getReport({
        columns: ["IMPRESSION_1"],
        start_date: "2026-03-01",
        end_date: "2026-03-04",
      })
    ).rejects.toThrow("DOES_NOT_EXIST");
  });

  it("downloadReport parses CSV", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      text: async () => "date,impressions\n2026-03-01,100\n2026-03-02,200",
    } as unknown as Response);

    const result = await service.downloadReport("https://example.com/report.csv");

    expect(result.headers).toEqual(["date", "impressions"]);
    expect(result.rows).toHaveLength(2);
    expect(result.totalRows).toBe(2);
  });

  it("downloadReport returns empty dataset for empty body", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      text: async () => "",
    } as unknown as Response);

    const result = await service.downloadReport("https://example.com/report.csv");

    expect(result).toEqual({ headers: [], rows: [], totalRows: 0 });
  });

  it("downloadReport returns empty dataset for BOM-only or whitespace-only body", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      text: async () => "\uFEFF \n\t",
    } as unknown as Response);

    const result = await service.downloadReport("https://example.com/report.csv");

    expect(result).toEqual({ headers: [], rows: [], totalRows: 0 });
  });

  it("downloadReport throws when Content-Length exceeds 50MB limit", async () => {
    const oversizeBytes = String(51 * 1024 * 1024); // 51MB
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "content-length": oversizeBytes }),
      text: async () => "should not be read",
    } as unknown as Response);

    await expect(service.downloadReport("https://example.com/huge-report.csv")).rejects.toThrow(
      "too large"
    );
  });

  it("downloadReport succeeds when Content-Length is under 50MB", async () => {
    const normalBytes = String(1024); // 1KB
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "content-length": normalBytes }),
      text: async () => "date,impressions\n2026-03-01,50",
    } as unknown as Response);

    const result = await service.downloadReport("https://example.com/small-report.csv");
    expect(result.rows).toHaveLength(1);
  });

  it("getReport runs submit -> poll -> download flow", async () => {
    mockHttpClient.post.mockResolvedValueOnce({ token: "token-xyz" });
    mockHttpClient.get.mockResolvedValueOnce({
      report_status: "FINISHED",
      url: "https://example.com/token-xyz.csv",
    });
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      text: async () => "date,impressions\n2026-03-01,100",
    } as unknown as Response);

    const result = await service.getReport({
      columns: ["IMPRESSION_1"],
      start_date: "2026-03-01",
      end_date: "2026-03-04",
    });

    expect(result.taskId).toBe("token-xyz");
    expect(result.rows).toHaveLength(1);
  });

  it("checkReportStatus makes single GET to Pinterest v5 endpoint and returns status", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      report_status: "IN_PROGRESS",
    });

    const result = await service.checkReportStatus("token-456");

    expect(result.taskId).toBe("token-456");
    expect(result.status).toBe("IN_PROGRESS");
    expect(result.downloadUrl).toBeUndefined();
    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
    expect(mockHttpClient.get).toHaveBeenCalledWith(
      "/v5/ad_accounts/ad-acct-123/reports",
      { token: "token-456" },
      undefined
    );
  });

  it("checkReportStatus returns downloadUrl when FINISHED", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      report_status: "FINISHED",
      url: "https://example.com/done-report.csv",
    });

    const result = await service.checkReportStatus("token-789");

    expect(result.status).toBe("FINISHED");
    expect(result.downloadUrl).toBe("https://example.com/done-report.csv");
  });

  it("checkReportStatus consumes rate limiter once", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      report_status: "IN_PROGRESS",
    });

    await service.checkReportStatus("token-rl");

    expect(mockRateLimiter.consume).toHaveBeenCalledTimes(1);
    expect(mockRateLimiter.consume).toHaveBeenCalledWith("pinterest:reporting");
  });

  it("getReportBreakdowns sends breakdowns as targeting_types at the *_TARGETING level", async () => {
    mockHttpClient.post.mockResolvedValueOnce({ token: "token-bd" });
    mockHttpClient.get.mockResolvedValueOnce({ report_status: "FINISHED", url: "https://x/r.csv" });
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => "IMPRESSION_1,TARGETING_VALUE\n100,US",
    } as unknown as Response);

    await service.getReportBreakdowns(
      {
        type: "AD",
        columns: ["IMPRESSION_1"],
        start_date: "2026-03-01",
        end_date: "2026-03-04",
      },
      ["COUNTRY", "AGE_BUCKET"]
    );

    const body = mockHttpClient.post.mock.calls[0][1] as Record<string, unknown>;
    expect(body.columns).toEqual(["IMPRESSION_1"]);
    expect(body.targeting_types).toEqual(["COUNTRY", "AGE_BUCKET"]);
    expect(body.level).toBe("PIN_PROMOTION_TARGETING");
  });

  it("getReportBreakdowns rejects KEYWORD (no targeting level) before calling Pinterest", async () => {
    await expect(
      service.getReportBreakdowns(
        {
          type: "KEYWORD",
          columns: ["IMPRESSION_1"],
          start_date: "2026-03-01",
          end_date: "2026-03-04",
        },
        ["GENDER"]
      )
    ).rejects.toThrow(/no targeting-breakdown report at the KEYWORD level/);
    expect(mockHttpClient.post).not.toHaveBeenCalled();
  });

  it("getReportBreakdowns passes breakdowns to getReport as targeting_types, not columns", async () => {
    const getReportSpy = vi.spyOn(service, "getReport").mockResolvedValueOnce({
      headers: ["date", "country"],
      rows: [["2026-03-01", "US"]],
      totalRows: 1,
      taskId: "token-bd",
    });

    const result = await service.getReportBreakdowns(
      {
        columns: ["IMPRESSION_1"],
        start_date: "2026-03-01",
        end_date: "2026-03-04",
      },
      ["GENDER"]
    );

    expect(getReportSpy).toHaveBeenCalledWith(
      expect.objectContaining({ columns: ["IMPRESSION_1"], targeting_types: ["GENDER"] }),
      expect.any(Number),
      undefined
    );
    expect(result.taskId).toBe("token-bd");
  });
});
