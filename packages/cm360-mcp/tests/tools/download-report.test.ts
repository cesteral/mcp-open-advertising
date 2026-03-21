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

function mockResponse(body: string, ok = true, status = 200, statusText = "OK"): Response {
  return {
    ok,
    status,
    statusText,
    text: vi.fn().mockResolvedValue(body),
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
      { downloadUrl: "https://example.com/report.csv", maxRows: 1000 },
      mockContext
    );

    expect(result.headers).toEqual(["Name", "Impressions", "Clicks"]);
    expect(result.rows).toEqual([
      ["Campaign A", "1000", "50"],
      ["Campaign B", "2000", "100"],
    ]);
    expect(result.totalRows).toBe(2);
    expect(result.returnedRows).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it("empty report returns empty arrays", async () => {
    mockState.cm360ReportingService.downloadReportFile.mockResolvedValue(mockResponse(""));

    const result = await downloadReportLogic(
      { downloadUrl: "https://example.com/report.csv", maxRows: 1000 },
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
      { downloadUrl: "https://example.com/report.csv", maxRows: 3 },
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
      { downloadUrl: "https://example.com/report.csv", maxRows: 10 },
      mockContext
    );

    expect(result.returnedRows).toBe(3);
    expect(result.truncated).toBe(false);
  });

  it("parses quoted CSV fields correctly", async () => {
    const csv = 'H1,H2,H3\n"field with, comma","field with ""quotes""",simple';
    mockState.cm360ReportingService.downloadReportFile.mockResolvedValue(mockResponse(csv));

    const result = await downloadReportLogic(
      { downloadUrl: "https://example.com/report.csv", maxRows: 1000 },
      mockContext
    );

    expect(result.rows[0]).toEqual(["field with, comma", 'field with "quotes"', "simple"]);
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
      rows: [["1", "2"], ["3", "4"]],
      totalRows: 2,
      returnedRows: 2,
      truncated: false,
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(output[0].text).toContain("2 rows");
  });

  it("shows truncation note when truncated", () => {
    const output = downloadReportResponseFormatter({
      headers: ["A"],
      rows: [["1"], ["2"], ["3"]],
      totalRows: 10,
      returnedRows: 3,
      truncated: true,
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(output[0].text).toContain("truncated");
    expect(output[0].text).toContain("3");
    expect(output[0].text).toContain("10");
  });

  it("shows empty message when 0 rows", () => {
    const output = downloadReportResponseFormatter({
      headers: [],
      rows: [],
      totalRows: 0,
      returnedRows: 0,
      truncated: false,
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

  it("maxRows defaults to 1000", () => {
    const result = DownloadReportInputSchema.parse({
      downloadUrl: "https://example.com/report.csv",
    });
    expect(result.maxRows).toBe(1000);
  });
});
