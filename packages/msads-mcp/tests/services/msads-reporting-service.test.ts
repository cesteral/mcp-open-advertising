import { describe, it, expect, vi, beforeEach } from "vitest";
import { MsAdsReportingService, type ReportConfig } from "../../src/services/msads/msads-reporting-service.js";
import type { MsAdsHttpClient } from "../../src/services/msads/msads-http-client.js";
import type { RateLimiter } from "@cesteral/shared";
import pino from "pino";

vi.mock("@cesteral/shared", async () => {
  const actual = await vi.importActual("@cesteral/shared");
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
  };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetch = vi.mocked(fetchWithTimeout);

const logger = pino({ level: "silent" });

function createMockHttpClient(): MsAdsHttpClient {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
  } as unknown as MsAdsHttpClient;
}

function createMockRateLimiter(): RateLimiter {
  return { consume: vi.fn().mockResolvedValue(undefined) } as unknown as RateLimiter;
}

const sampleConfig: ReportConfig = {
  reportType: "CampaignPerformanceReportRequest",
  accountId: "12345",
  columns: ["CampaignName", "Impressions", "Clicks"],
  dateRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
};

describe("MsAdsReportingService", () => {
  let service: MsAdsReportingService;
  let httpClient: MsAdsHttpClient;
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    vi.clearAllMocks();
    httpClient = createMockHttpClient();
    rateLimiter = createMockRateLimiter();
    // Use short poll interval for tests
    service = new MsAdsReportingService(rateLimiter, httpClient, logger, 10, 5);
  });

  describe("submitReport", () => {
    it("submits a report and returns ReportRequestId", async () => {
      (httpClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ReportRequestId: "req-abc-123",
      });

      const id = await service.submitReport(sampleConfig);
      expect(id).toBe("req-abc-123");
      expect(httpClient.post).toHaveBeenCalledWith(
        "/Reports/Submit",
        expect.objectContaining({
          ReportRequest: expect.objectContaining({
            Type: "CampaignPerformanceReportRequest",
            Columns: ["CampaignName", "Impressions", "Clicks"],
          }),
        }),
        undefined
      );
    });
  });

  describe("checkReportStatus", () => {
    it("returns status and download URL", async () => {
      (httpClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ReportRequestStatus: {
          Status: "Success",
          ReportDownloadUrl: "https://download.example.com/report.csv",
        },
      });

      const result = await service.checkReportStatus("req-123");
      expect(result.status).toBe("Success");
      expect(result.downloadUrl).toBe("https://download.example.com/report.csv");
    });

    it("returns pending status without URL", async () => {
      (httpClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ReportRequestStatus: {
          Status: "Pending",
        },
      });

      const result = await service.checkReportStatus("req-123");
      expect(result.status).toBe("Pending");
      expect(result.downloadUrl).toBeUndefined();
    });
  });

  describe("pollReport", () => {
    it("polls until Success and returns download URL", async () => {
      (httpClient.post as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ReportRequestStatus: { Status: "Pending" },
        })
        .mockResolvedValueOnce({
          ReportRequestStatus: { Status: "InProgress" },
        })
        .mockResolvedValueOnce({
          ReportRequestStatus: {
            Status: "Success",
            ReportDownloadUrl: "https://download.example.com/report.csv",
          },
        });

      const url = await service.pollReport("req-123");
      expect(url).toBe("https://download.example.com/report.csv");
      expect(httpClient.post).toHaveBeenCalledTimes(3);
    });

    it("throws on Error status", async () => {
      (httpClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ReportRequestStatus: { Status: "Error" },
      });

      await expect(service.pollReport("req-123")).rejects.toThrow("report failed");
    });

    it("throws on timeout", async () => {
      (httpClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        ReportRequestStatus: { Status: "Pending" },
      });

      await expect(service.pollReport("req-123")).rejects.toThrow("timed out");
    });
  });

  describe("downloadReport", () => {
    it("downloads and parses CSV report", async () => {
      const csvContent = [
        "CampaignName,Impressions,Clicks",
        "Campaign A,1000,50",
        "Campaign B,2000,100",
      ].join("\n");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => csvContent,
      } as Response);

      const result = await service.downloadReport("https://download.example.com/report.csv");
      expect(result.headers).toEqual(["CampaignName", "Impressions", "Clicks"]);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual(["Campaign A", "1000", "50"]);
    });

    it("respects maxRows limit", async () => {
      const csvContent = [
        "Name,Value",
        "A,1",
        "B,2",
        "C,3",
      ].join("\n");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => csvContent,
      } as Response);

      const result = await service.downloadReport("https://example.com/report.csv", 2);
      expect(result.rows).toHaveLength(2);
    });

    it("handles metadata lines in CSV", async () => {
      const csvContent = [
        '@"Report Name"',
        '@"Date Range"',
        "CampaignName,Impressions",
        "Test,500",
        '© Microsoft Corporation',
      ].join("\n");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => csvContent,
      } as Response);

      const result = await service.downloadReport("https://example.com/report.csv");
      expect(result.headers).toEqual(["CampaignName", "Impressions"]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual(["Test", "500"]);
    });

    it("throws on download failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response);

      await expect(
        service.downloadReport("https://example.com/report.csv")
      ).rejects.toThrow("Failed to download report");
    });
  });

  describe("getReport", () => {
    it("runs full submit → poll → download flow", async () => {
      // Submit
      (httpClient.post as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ReportRequestId: "req-full" })
        // Poll (Success on first try)
        .mockResolvedValueOnce({
          ReportRequestStatus: {
            Status: "Success",
            ReportDownloadUrl: "https://example.com/full-report.csv",
          },
        });

      // Download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "Col1,Col2\nA,B",
      } as Response);

      const result = await service.getReport(sampleConfig);
      expect(result.reportRequestId).toBe("req-full");
      expect(result.headers).toEqual(["Col1", "Col2"]);
      expect(result.rows).toHaveLength(1);
    });
  });
});
