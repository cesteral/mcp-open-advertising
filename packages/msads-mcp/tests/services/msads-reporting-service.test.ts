import { deflateRawSync } from "node:zlib";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MsAdsReportingService,
  type ReportConfig,
} from "../../src/services/msads/msads-reporting-service.js";
import type { MsAdsHttpClient } from "../../src/services/msads/msads-http-client.js";
import type { RateLimiter } from "@cesteral/shared";
import pino from "pino";

vi.mock("@cesteral/shared", async () => {
  const actual = await vi.importActual("@cesteral/shared");
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
    delay: vi.fn().mockResolvedValue(undefined),
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

/** Build a Response-like whose body is `text` encoded as UTF-8 bytes. */
function textResponse(text: string): Response {
  const bytes = Buffer.from(text, "utf-8");
  return {
    ok: true,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Response;
}

/** Build a Response-like whose body is a valid single-entry ZIP of `content`. */
function zipResponse(content: string, name = "report.csv"): Response {
  const data = deflateRawSync(Buffer.from(content, "utf-8"));
  const nameBuf = Buffer.from(name, "utf-8");
  const method = 8;
  const uncompressed = Buffer.byteLength(content, "utf-8");

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(0, 14); // crc32 (not verified by the reader)
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(uncompressed, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  const localHeader = Buffer.concat([local, nameBuf, data]);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(0, 16); // crc32
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(uncompressed, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42); // local header offset
  const centralHeader = Buffer.concat([central, nameBuf]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralHeader.length, 12);
  eocd.writeUInt32LE(localHeader.length, 16);

  const zip = Buffer.concat([localHeader, centralHeader, eocd]);
  return {
    ok: true,
    arrayBuffer: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength),
  } as unknown as Response;
}

describe("MsAdsReportingService", () => {
  let service: MsAdsReportingService;
  let httpClient: MsAdsHttpClient;
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    vi.clearAllMocks();
    httpClient = createMockHttpClient();
    rateLimiter = createMockRateLimiter();
    // Use low maxPollAttempts + 1ms poll interval so timing tests don't wait.
    service = new MsAdsReportingService(rateLimiter, httpClient, logger, 5, 1);
  });

  describe("submitReport", () => {
    it("submits a report and returns ReportRequestId", async () => {
      (httpClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ReportRequestId: "req-abc-123",
      });

      const id = await service.submitReport(sampleConfig);
      expect(id).toBe("req-abc-123");
      expect(httpClient.post).toHaveBeenCalledWith(
        "/GenerateReport/Submit",
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
      expect(httpClient.post).toHaveBeenCalledWith(
        "/GenerateReport/Poll",
        { ReportRequestId: "req-123" },
        undefined
      );
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

      await expect(service.pollReport("req-123")).rejects.toThrow(
        /Report polling exceeded 5 attempts/
      );
    });
  });

  describe("downloadReport", () => {
    it("downloads and parses CSV report", async () => {
      const csvContent = [
        "CampaignName,Impressions,Clicks",
        "Campaign A,1000,50",
        "Campaign B,2000,100",
      ].join("\n");

      mockFetch.mockResolvedValueOnce(textResponse(csvContent));

      const result = await service.downloadReport("https://download.example.com/report.csv");
      expect(result.headers).toEqual(["CampaignName", "Impressions", "Clicks"]);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual(["Campaign A", "1000", "50"]);
    });

    it("respects maxRows limit", async () => {
      const csvContent = ["Name,Value", "A,1", "B,2", "C,3"].join("\n");

      mockFetch.mockResolvedValueOnce(textResponse(csvContent));

      const result = await service.downloadReport("https://example.com/report.csv", 2);
      expect(result.rows).toHaveLength(2);
    });

    it("handles metadata lines in CSV", async () => {
      const csvContent = [
        '@"Report Name"',
        '@"Date Range"',
        "CampaignName,Impressions",
        "Test,500",
        "© Microsoft Corporation",
      ].join("\n");

      mockFetch.mockResolvedValueOnce(textResponse(csvContent));

      const result = await service.downloadReport("https://example.com/report.csv");
      expect(result.headers).toEqual(["CampaignName", "Impressions"]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual(["Test", "500"]);
    });

    it("decompresses a ZIP report body before parsing", async () => {
      const csvContent = [
        '"Report Name: Campaign Performance Report"',
        '"Report Time: 1/1/2026 12:00:00 AM - 1/31/2026 11:59:59 PM"',
        '"Time Zone: (GMT) Coordinated Universal Time"',
        "CampaignName,Impressions,Clicks",
        "Campaign A,1000,50",
        "Campaign B,2000,100",
        '"©2026 Microsoft Corporation. All rights reserved."',
      ].join("\n");

      mockFetch.mockResolvedValueOnce(zipResponse(csvContent));

      const result = await service.downloadReport("https://download.example.com/report.csv");
      // Headers must be the real column row, not ZIP magic bytes or metadata.
      expect(result.headers).toEqual(["CampaignName", "Impressions", "Clicks"]);
      expect(result.headers[0]).not.toMatch(/^PK/);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual(["Campaign A", "1000", "50"]);
    });

    it("strips quoted key/value metadata rows before the header (plain CSV)", async () => {
      const csvContent = [
        '"Report Name: Campaign Performance Report"',
        '"Report Time: 1/1/2026 - 1/31/2026"',
        '"Time Zone: (GMT) Coordinated Universal Time"',
        "CampaignName,Impressions",
        "Winter Sale,500",
      ].join("\n");

      mockFetch.mockResolvedValueOnce(textResponse(csvContent));

      const result = await service.downloadReport("https://example.com/report.csv");
      expect(result.headers).toEqual(["CampaignName", "Impressions"]);
      expect(result.rows).toEqual([["Winter Sale", "500"]]);
    });

    it("keeps data values that contain ': ' after the header row", async () => {
      // A metadata-looking value ("Q1: Launch") appears in the DATA, past the
      // header — it must be preserved, not stripped as a metadata row.
      const csvContent = ["CampaignName,Impressions", '"Q1: Launch",750'].join("\n");

      mockFetch.mockResolvedValueOnce(textResponse(csvContent));

      const result = await service.downloadReport("https://example.com/report.csv");
      expect(result.headers).toEqual(["CampaignName", "Impressions"]);
      expect(result.rows).toEqual([["Q1: Launch", "750"]]);
    });

    it("throws on download failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response);

      await expect(service.downloadReport("https://example.com/report.csv")).rejects.toThrow(
        "Failed to download report"
      );
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
      mockFetch.mockResolvedValueOnce(textResponse("Col1,Col2\nA,B"));

      const result = await service.getReport(sampleConfig);
      expect(result.reportRequestId).toBe("req-full");
      expect(result.headers).toEqual(["Col1", "Col2"]);
      expect(result.rows).toHaveLength(1);
    });
  });
});
