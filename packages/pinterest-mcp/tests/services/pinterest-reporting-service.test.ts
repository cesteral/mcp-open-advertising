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
    service = new PinterestReportingService(mockRateLimiter as any, mockHttpClient as any, mockLogger);
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

  it("pollReport returns FINISHED result", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      report_status: "FINISHED",
      token: "token-123",
      url: "https://example.com/report.csv",
    });

    const result = await service.pollReport("token-123");
    expect(result.report_status).toBe("FINISHED");
    expect(result.url).toContain("report.csv");
  });

  it("pollReport returns immediately on DOES_NOT_EXIST status", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      report_status: "DOES_NOT_EXIST",
      token: "invalid-token",
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
      token: "bad-token",
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

  it("downloadReport throws when Content-Length exceeds 50MB limit", async () => {
    const oversizeBytes = String(51 * 1024 * 1024); // 51MB
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "content-length": oversizeBytes }),
      text: async () => "should not be read",
    } as unknown as Response);

    await expect(
      service.downloadReport("https://example.com/huge-report.csv")
    ).rejects.toThrow("too large");
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
      token: "token-xyz",
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
      token: "token-456",
    });

    const result = await service.checkReportStatus("token-456");

    expect(result.taskId).toBe("token-456");
    expect(result.status).toBe("IN_PROGRESS");
    expect(result.downloadUrl).toBeUndefined();
    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
    expect(mockHttpClient.get).toHaveBeenCalledWith(
      "/v5/ad_accounts/ad-acct-123/reports/token-456",
      undefined,
      undefined
    );
  });

  it("checkReportStatus returns downloadUrl when FINISHED", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      report_status: "FINISHED",
      token: "token-789",
      url: "https://example.com/done-report.csv",
    });

    const result = await service.checkReportStatus("token-789");

    expect(result.status).toBe("FINISHED");
    expect(result.downloadUrl).toBe("https://example.com/done-report.csv");
  });

  it("checkReportStatus consumes rate limiter once", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      report_status: "IN_PROGRESS",
      token: "token-rl",
    });

    await service.checkReportStatus("token-rl");

    expect(mockRateLimiter.consume).toHaveBeenCalledTimes(1);
    expect(mockRateLimiter.consume).toHaveBeenCalledWith("pinterest:reporting");
  });

  it("getReportBreakdowns appends breakdown columns", async () => {
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
      ["SPEND_IN_DOLLAR"]
    );

    expect(getReportSpy).toHaveBeenCalledWith(
      expect.objectContaining({ columns: ["IMPRESSION_1", "SPEND_IN_DOLLAR"] }),
      undefined
    );
    expect(result.taskId).toBe("token-bd");
  });
});
