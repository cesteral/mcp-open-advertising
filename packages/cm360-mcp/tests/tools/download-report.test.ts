import { describe, it, expect, vi, beforeEach } from "vitest";

const mockState = vi.hoisted(() => ({
  cm360Service: {
    getEntity: vi.fn(),
    createEntity: vi.fn(),
    updateEntity: vi.fn(),
    deleteEntity: vi.fn(),
    listEntities: vi.fn(),
    listUserProfiles: vi.fn(),
    listTargetingOptions: vi.fn(),
  },
  cm360ReportingService: {
    runReport: vi.fn(),
    createReport: vi.fn(),
    checkReportFile: vi.fn(),
    downloadReportFile: vi.fn(),
  },
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(() => mockState),
}));

vi.mock("../../src/mcp-server/tools/utils/entity-mapping.js", () => ({
  getEntityTypeEnum: () => [
    "campaign", "placement", "ad", "creative", "site",
    "advertiser", "floodlightActivity", "floodlightConfiguration",
  ],
  getDeletableEntityTypeEnum: () => ["floodlightActivity"],
}));

import {
  downloadReportLogic,
  downloadReportResponseFormatter,
  DownloadReportInputSchema,
} from "../../src/mcp-server/tools/definitions/download-report.tool.js";

const mockContext = { requestId: "test-req" } as any;

function mockResponse(
  body: string,
  ok = true,
  status = 200,
  statusText = "OK",
  contentType = "text/csv"
): Response {
  return {
    ok,
    status,
    statusText,
    text: vi.fn().mockResolvedValue(body),
    headers: {
      get: vi.fn((name: string) => (name.toLowerCase() === "content-type" ? contentType : null)),
    },
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("downloadReportLogic", () => {
  it("basic CSV returns correct headers and rows", async () => {
    const csv = "Name,Impressions,Clicks\nCampaign A,1000,50\nCampaign B,2000,100";
    mockState.cm360ReportingService.downloadReportFile.mockResolvedValue(mockResponse(csv));

    const result = await downloadReportLogic(
      { downloadUrl: "https://example.com/report.csv", mode: "rows", maxRows: 1000 },
      mockContext
    );

    expect(result.headers).toEqual(["Name", "Impressions", "Clicks"]);
    expect(result.rows).toEqual([
      { Name: "Campaign A", Impressions: "1000", Clicks: "50" },
      { Name: "Campaign B", Impressions: "2000", Clicks: "100" },
    ]);
    expect(result.totalRows).toBe(2);
    expect(result.returnedRows).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it("empty report returns empty arrays", async () => {
    mockState.cm360ReportingService.downloadReportFile.mockResolvedValue(mockResponse(""));

    const result = await downloadReportLogic(
      { downloadUrl: "https://example.com/report.csv", mode: "rows", maxRows: 1000 },
      mockContext
    );

    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.totalRows).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("truncates when data rows exceed maxRows", async () => {
    const lines = ["H1,H2"];
    for (let i = 0; i < 5; i++) lines.push(`a${i},b${i}`);
    mockState.cm360ReportingService.downloadReportFile.mockResolvedValue(
      mockResponse(lines.join("\n"))
    );

    const result = await downloadReportLogic(
      { downloadUrl: "https://example.com/report.csv", mode: "rows", maxRows: 3 },
      mockContext
    );

    expect(result.returnedRows).toBe(3);
    expect(result.totalRows).toBe(5);
    expect(result.truncated).toBe(true);
  });

  it("does not truncate when data rows are under maxRows", async () => {
    const lines = ["H1,H2"];
    for (let i = 0; i < 3; i++) lines.push(`a${i},b${i}`);
    mockState.cm360ReportingService.downloadReportFile.mockResolvedValue(
      mockResponse(lines.join("\n"))
    );

    const result = await downloadReportLogic(
      { downloadUrl: "https://example.com/report.csv", mode: "rows", maxRows: 10 },
      mockContext
    );

    expect(result.returnedRows).toBe(3);
    expect(result.truncated).toBe(false);
  });

  it("parses quoted CSV fields correctly", async () => {
    const csv = 'H1,H2,H3\n"field with, comma","field with ""quotes""",simple';
    mockState.cm360ReportingService.downloadReportFile.mockResolvedValue(mockResponse(csv));

    const result = await downloadReportLogic(
      { downloadUrl: "https://example.com/report.csv", mode: "rows", maxRows: 1000 },
      mockContext
    );

    expect(result.rows?.[0]).toEqual({
      H1: "field with, comma",
      H2: 'field with "quotes"',
      H3: "simple",
    });
  });

  it("parses quoted multiline CSV fields correctly", async () => {
    const csv = 'H1,H2\n"line 1\nline 2",value';
    mockState.cm360ReportingService.downloadReportFile.mockResolvedValue(mockResponse(csv));

    const result = await downloadReportLogic(
      { downloadUrl: "https://example.com/report.csv", mode: "rows", maxRows: 1000 },
      mockContext
    );

    expect(result.rows?.[0]).toEqual({ H1: "line 1\nline 2", H2: "value" });
  });

  it("rejects Excel downloads", async () => {
    mockState.cm360ReportingService.downloadReportFile.mockResolvedValue(
      mockResponse("binary", true, 200, "OK", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    );

    await expect(
      downloadReportLogic(
        { downloadUrl: "https://example.com/report.xlsx", maxRows: 1000 },
        mockContext
      )
    ).rejects.toThrow("Unsupported CM360 report format: EXCEL");
  });

  it("omits computed columns when required inputs are unavailable", async () => {
    const csv = "Name\nCampaign A";
    mockState.cm360ReportingService.downloadReportFile.mockResolvedValue(mockResponse(csv));

    const result = await downloadReportLogic(
      { downloadUrl: "https://example.com/report.csv", mode: "rows", maxRows: 1000, includeComputedMetrics: true },
      mockContext
    );

    expect(result.headers).toEqual(["Name"]);
    expect(result.rows).toEqual([{ Name: "Campaign A" }]);
  });

  it("throws on non-OK response", async () => {
    mockState.cm360ReportingService.downloadReportFile.mockResolvedValue(
      mockResponse("Forbidden", false, 403, "Forbidden")
    );

    await expect(
      downloadReportLogic(
        { downloadUrl: "https://example.com/report.csv", maxRows: 1000 },
        mockContext
      )
    ).rejects.toThrow("Failed to download report: 403");
  });

  it("includes truncated body text in error for non-OK response", async () => {
    mockState.cm360ReportingService.downloadReportFile.mockResolvedValue(
      mockResponse("Detailed error message from server", false, 500, "Internal Server Error")
    );

    await expect(
      downloadReportLogic(
        { downloadUrl: "https://example.com/report.csv", maxRows: 1000 },
        mockContext
      )
    ).rejects.toThrow("Detailed error message from server");
  });
});

describe("downloadReportResponseFormatter", () => {
  it("shows row count", () => {
    const output = downloadReportResponseFormatter({
      headers: ["A", "B"],
      selectedColumns: ["A", "B"],
      mode: "rows",
      rows: [["1", "2"], ["3", "4"]],
      totalRows: 2,
      returnedRows: 2,
      truncated: false,
      nextOffset: null,
      warnings: [],
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(output[0].text).toContain("2 rows");
  });

  it("shows truncation note when truncated", () => {
    const output = downloadReportResponseFormatter({
      headers: ["A"],
      selectedColumns: ["A"],
      mode: "rows",
      rows: [["1"], ["2"], ["3"]],
      totalRows: 10,
      returnedRows: 3,
      truncated: true,
      nextOffset: 3,
      warnings: [],
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(output[0].text).toContain("Next offset");
    expect(output[0].text).toContain("3");
    expect(output[0].text).toContain("10");
  });

  it("shows empty message when 0 rows", () => {
    const output = downloadReportResponseFormatter({
      headers: [],
      selectedColumns: [],
      mode: "summary",
      previewRows: [],
      totalRows: 0,
      returnedRows: 0,
      truncated: false,
      nextOffset: null,
      warnings: [],
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(output[0].text).toContain("Report is empty");
  });
});

describe("DownloadReportInputSchema", () => {
  it("requires downloadUrl to be a valid URL", () => {
    const result = DownloadReportInputSchema.safeParse({
      downloadUrl: "https://example.com/report.csv",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid URL", () => {
    const result = DownloadReportInputSchema.safeParse({
      downloadUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("defaults to summary mode without maxRows", () => {
    const result = DownloadReportInputSchema.parse({
      downloadUrl: "https://example.com/report.csv",
    });
    expect(result.mode).toBe("summary");
    expect(result.maxRows).toBeUndefined();
  });
});
