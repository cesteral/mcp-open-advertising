import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSpillBodyToGcs } = vi.hoisted(() => ({
  mockSpillBodyToGcs: vi.fn(),
}));

// A single in-memory ReportCsvStore instance is created lazily inside the
// mock factory so tests can assert round-trips against the persisted entry.
vi.mock("../../src/services/session-services.js", async () => {
  const { ReportCsvStore } = await import("@cesteral/shared");
  return {
    sessionServiceStore: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      getAuthContext: vi.fn(),
    },
    reportCsvStore: new ReportCsvStore(),
  };
});

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    resolveSessionServicesFromStore: vi.fn(),
    spillBodyToGcs: mockSpillBodyToGcs,
  };
});

import { resolveSessionServicesFromStore } from "@cesteral/shared";
const mockResolveSession = vi.mocked(resolveSessionServicesFromStore);

import {
  downloadReportLogic,
  downloadReportResponseFormatter,
} from "../../src/mcp-server/tools/definitions/download-report.tool.js";

const mockDownloadReport = vi.fn();
const mockGetReportDownloadUrl = vi.fn();
const SIGNED_URL = "https://ads.tiktok.com/wsos_v2/statistics/object/wsos1?expire=1&sign=2";
const taskInput = { advertiserId: "1234567890", taskId: "task-abc" } as const;

beforeEach(() => {
  // Scrub the spill env so tests that don't opt into spill behavior stay
  // deterministic regardless of the developer's shell.
  delete process.env.REPORT_SPILL_BUCKET;
  mockDownloadReport.mockReset();
  mockGetReportDownloadUrl.mockReset().mockResolvedValue({ downloadUrl: SIGNED_URL });
  mockSpillBodyToGcs.mockReset();
  mockSpillBodyToGcs.mockResolvedValue({ disabled: true, reason: "bucket-not-set" });
  mockResolveSession.mockReturnValue({
    tiktokReportingService: {
      downloadReport: mockDownloadReport,
      getReportDownloadUrl: mockGetReportDownloadUrl,
    },
    boundAdvertiserId: "1234567890",
  } as any);
});

const baseContext = { requestId: "test-req" } as any;
const baseSdkContext = { sessionId: "test-session" } as any;

describe("downloadReportLogic", () => {
  it("asks TikTok for the URL of the task and downloads exactly that", async () => {
    mockDownloadReport.mockResolvedValueOnce({ headers: ["a"], rows: [], totalRows: 0 });

    await downloadReportLogic({ ...taskInput, mode: "rows" } as any, baseContext, baseSdkContext);

    expect(mockGetReportDownloadUrl).toHaveBeenCalledWith("task-abc", baseContext);
    expect(mockDownloadReport).toHaveBeenCalledWith(SIGNED_URL, expect.any(Number), undefined, {
      includeRawCsv: false,
    });
  });

  it("refuses a task for another advertiser before calling TikTok", async () => {
    await expect(
      downloadReportLogic(
        { advertiserId: "9999999999", taskId: "task-abc", mode: "rows" } as any,
        baseContext,
        baseSdkContext
      )
    ).rejects.toThrow();
    expect(mockGetReportDownloadUrl).not.toHaveBeenCalled();
    expect(mockDownloadReport).not.toHaveBeenCalled();
  });

  // The URL now comes from TikTok, not the client, but it is still fetched
  // server-side: a bad value must never reach the network.
  it.each([
    "https://169.254.169.254/computeMetadata/v1/",
    "https://metadata.google.internal/computeMetadata/v1/",
    "https://localhost/report.csv",
    "http://ads.tiktok.com/report.csv",
  ])("refuses a returned URL of %s before fetching", async (downloadUrl) => {
    mockGetReportDownloadUrl.mockResolvedValueOnce({ downloadUrl });
    await expect(
      downloadReportLogic({ ...taskInput, mode: "rows" } as any, baseContext, baseSdkContext)
    ).rejects.toThrow("download URL");
    expect(mockDownloadReport).not.toHaveBeenCalled();
  });

  it("returns parsed CSV data", async () => {
    mockDownloadReport.mockResolvedValueOnce({
      headers: ["date", "impressions", "clicks"],
      rows: [
        ["2026-03-01", "1000", "50"],
        ["2026-03-02", "1200", "60"],
      ],
      totalRows: 2,
    });

    const result = await downloadReportLogic(
      { ...taskInput, mode: "rows" },
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
      { ...taskInput, maxRows: 1 },
      baseContext,
      baseSdkContext
    );

    expect(result.truncated).toBe(true);
    expect(result.totalRows).toBe(5000);
  });

  it("uses summary fetch limit by default", async () => {
    mockDownloadReport.mockResolvedValueOnce({
      headers: ["date"],
      rows: [],
      totalRows: 0,
    });

    await downloadReportLogic({ ...taskInput }, baseContext, baseSdkContext);

    expect(mockDownloadReport).toHaveBeenCalledWith(SIGNED_URL, 10, undefined, {
      includeRawCsv: false,
    });
  });

  it("persists rawCsv and returns a report-csv:// URI when storeRawCsv is true", async () => {
    mockDownloadReport.mockResolvedValueOnce({
      headers: ["date", "impressions"],
      rows: [["2026-03-01", "1000"]],
      totalRows: 1,
      rawCsv: "date,impressions\n2026-03-01,1000\n",
    });

    const result = await downloadReportLogic(
      {
        ...taskInput,
        storeRawCsv: true,
      },
      baseContext,
      baseSdkContext
    );

    expect(mockDownloadReport).toHaveBeenCalledWith(SIGNED_URL, 10, undefined, {
      includeRawCsv: true,
    });
    expect(result.rawCsvResourceUri).toMatch(/^report-csv:\/\//);
    expect(result.rawCsvByteLength).toBe(
      Buffer.byteLength("date,impressions\n2026-03-01,1000\n", "utf8")
    );

    const { reportCsvStore } = await import("../../src/services/session-services.js");
    const entry = reportCsvStore.getByUri(result.rawCsvResourceUri!);
    expect(entry).toBeDefined();
    expect(entry!.csv).toBe("date,impressions\n2026-03-01,1000\n");
  });
});

describe("GCS spill integration", () => {
  it("does not fetch rawCsv when neither storeRawCsv nor REPORT_SPILL_BUCKET is set", async () => {
    mockDownloadReport.mockResolvedValueOnce({
      headers: ["date"],
      rows: [],
      totalRows: 0,
    });

    await downloadReportLogic({ ...taskInput }, baseContext, baseSdkContext);

    expect(mockDownloadReport).toHaveBeenCalledWith(SIGNED_URL, 10, undefined, {
      includeRawCsv: false,
    });
  });

  it("forces includeRawCsv: true when REPORT_SPILL_BUCKET is set", async () => {
    process.env.REPORT_SPILL_BUCKET = "test-bucket";
    mockDownloadReport.mockResolvedValueOnce({
      headers: ["date"],
      rows: [["2026-03-01"]],
      totalRows: 1,
      rawCsv: "date\n2026-03-01\n",
    });

    await downloadReportLogic({ ...taskInput }, baseContext, baseSdkContext);

    expect(mockDownloadReport).toHaveBeenCalledWith(SIGNED_URL, 10, undefined, {
      includeRawCsv: true,
    });
  });

  it("returns spill metadata when the helper reports success", async () => {
    process.env.REPORT_SPILL_BUCKET = "test-bucket";
    mockDownloadReport.mockResolvedValueOnce({
      headers: ["date"],
      rows: [["2026-03-01"]],
      totalRows: 1,
      rawCsv: "date\n2026-03-01\n",
    });
    mockSpillBodyToGcs.mockResolvedValueOnce({
      spilled: true,
      bucket: "test-bucket",
      objectName: "tiktok/s-1/report-ts.csv",
      bytes: 128,
      rowCount: 1,
      signedUrl: "https://signed.example/report",
      expiresAt: "2030-01-01T00:00:00.000Z",
      mimeType: "text/csv",
    });

    const result = await downloadReportLogic({ ...taskInput }, baseContext, baseSdkContext);

    expect(mockSpillBodyToGcs).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "date\n2026-03-01\n",
        mimeType: "text/csv",
        sessionId: "test-session",
        server: "tiktok",
        objectId: "task-abc",
        rowCount: 1,
      })
    );
    expect(result.spill).toEqual({
      bucket: "test-bucket",
      objectName: "tiktok/s-1/report-ts.csv",
      bytes: 128,
      rowCount: 1,
      signedUrl: "https://signed.example/report",
      expiresAt: "2030-01-01T00:00:00.000Z",
      mimeType: "text/csv",
    });
    expect(result.warnings).toEqual([]);
  });

  it("surfaces spill failures as a warning without breaking the response", async () => {
    process.env.REPORT_SPILL_BUCKET = "test-bucket";
    mockDownloadReport.mockResolvedValueOnce({
      headers: ["date"],
      rows: [],
      totalRows: 0,
      rawCsv: "date\n",
    });
    mockSpillBodyToGcs.mockResolvedValueOnce({ error: "gcs unreachable" });

    const result = await downloadReportLogic({ ...taskInput }, baseContext, baseSdkContext);

    expect(result.spill).toEqual({ error: "gcs unreachable" });
    expect(result.warnings.some((w) => w.includes("gcs unreachable"))).toBe(true);
  });

  it("omits spill when the helper says disabled (bucket set but under threshold)", async () => {
    process.env.REPORT_SPILL_BUCKET = "test-bucket";
    mockDownloadReport.mockResolvedValueOnce({
      headers: ["date"],
      rows: [],
      totalRows: 0,
      rawCsv: "date\n",
    });
    mockSpillBodyToGcs.mockResolvedValueOnce({ disabled: true, reason: "under-threshold" });

    const result = await downloadReportLogic({ ...taskInput }, baseContext, baseSdkContext);

    expect(result.spill).toBeUndefined();
  });
});

describe("downloadReportResponseFormatter", () => {
  it("formats results with column info and sample rows", () => {
    const result = {
      totalRows: 2,
      returnedRows: 2,
      truncated: false,
      headers: ["date", "impressions"],
      selectedColumns: ["date", "impressions"],
      mode: "rows" as const,
      rows: [
        { date: "2026-03-01", impressions: "1000" },
        { date: "2026-03-02", impressions: "1200" },
      ],
      nextOffset: null,
      warnings: [],
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
      selectedColumns: ["date"],
      mode: "rows" as const,
      rows: [{ date: "2026-03-01" }],
      nextOffset: 1000,
      warnings: [],
      timestamp: "2026-03-04T00:00:00.000Z",
    };

    const content = downloadReportResponseFormatter(result);
    expect(content[0].text).toContain("Showing 1000 of 5000 rows");
  });
});
