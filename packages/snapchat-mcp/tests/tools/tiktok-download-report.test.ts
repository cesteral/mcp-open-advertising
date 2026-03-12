import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/services/session-services.js", () => ({
  sessionServiceStore: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getAuthContext: vi.fn(),
  },
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    resolveSessionServicesFromStore: vi.fn(),
  };
});

import { resolveSessionServicesFromStore } from "@cesteral/shared";
const mockResolveSession = vi.mocked(resolveSessionServicesFromStore);

import {
  downloadReportLogic,
  downloadReportResponseFormatter,
} from "../../src/mcp-server/tools/definitions/download-report.tool.js";

const mockDownloadReport = vi.fn();

beforeEach(() => {
  mockDownloadReport.mockReset();
  mockResolveSession.mockReturnValue({
    snapchatReportingService: {
      downloadReport: mockDownloadReport,
    },
  } as any);
});

const baseContext = { requestId: "test-req" } as any;
const baseSdkContext = { sessionId: "test-session" } as any;

describe("downloadReportLogic", () => {
  it("returns parsed CSV data", async () => {
    mockDownloadReport.mockResolvedValueOnce({
      headers: ["date", "impressions", "clicks"],
      rows: [["2026-03-01", "1000", "50"], ["2026-03-02", "1200", "60"]],
      totalRows: 2,
    });

    const result = await downloadReportLogic(
      { downloadUrl: "https://example.com/report.csv" },
      baseContext,
      baseSdkContext
    );

    expect(result.headers).toEqual(["date", "impressions", "clicks"]);
    expect(result.rows).toHaveLength(2);
    expect(result.totalRows).toBe(2);
    expect(result.returnedRows).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.timestamp).toBeDefined();
  });

  it("indicates truncation when totalRows exceeds returned rows", async () => {
    mockDownloadReport.mockResolvedValueOnce({
      headers: ["date"],
      rows: [["2026-03-01"]],
      totalRows: 5000,
    });

    const result = await downloadReportLogic(
      { downloadUrl: "https://example.com/report.csv", maxRows: 1 },
      baseContext,
      baseSdkContext
    );

    expect(result.truncated).toBe(true);
    expect(result.totalRows).toBe(5000);
  });

  it("uses default maxRows of 1000", async () => {
    mockDownloadReport.mockResolvedValueOnce({
      headers: ["date"],
      rows: [],
      totalRows: 0,
    });

    await downloadReportLogic(
      { downloadUrl: "https://example.com/report.csv" },
      baseContext,
      baseSdkContext
    );

    expect(mockDownloadReport).toHaveBeenCalledWith(
      "https://example.com/report.csv",
      1000
    );
  });
});

describe("downloadReportResponseFormatter", () => {
  it("formats results with column info and sample rows", () => {
    const result = {
      totalRows: 2,
      returnedRows: 2,
      truncated: false,
      headers: ["date", "impressions"],
      rows: [["2026-03-01", "1000"], ["2026-03-02", "1200"]],
      timestamp: "2026-03-04T00:00:00.000Z",
    };

    const content = downloadReportResponseFormatter(result);
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("text");
    expect(content[0].text).toContain("Report data: 2 rows");
    expect(content[0].text).toContain("date, impressions");
  });

  it("shows truncation notice when truncated", () => {
    const result = {
      totalRows: 5000,
      returnedRows: 1000,
      truncated: true,
      headers: ["date"],
      rows: [["2026-03-01"]],
      timestamp: "2026-03-04T00:00:00.000Z",
    };

    const content = downloadReportResponseFormatter(result);
    expect(content[0].text).toContain("1000 of 5000 rows (truncated)");
  });
});
