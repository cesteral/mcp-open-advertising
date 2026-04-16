import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@cesteral/shared", async () => {
  const actual = await vi.importActual("@cesteral/shared");
  return {
    ...actual,
    resolveSessionServicesFromStore: vi.fn(),
  };
});

import { resolveSessionServicesFromStore } from "@cesteral/shared";
const mockResolveSession = vi.mocked(resolveSessionServicesFromStore);

import {
  DownloadReportInputSchema,
  downloadReportLogic,
} from "../../src/mcp-server/tools/definitions/download-report.tool.js";
import type { SessionServices } from "../../src/services/session-services.js";

const HEADERS = ["CampaignName", "Impressions", "Clicks"];

function makeRows(count: number): string[][] {
  return Array.from({ length: count }, (_, i) => [
    `Campaign ${i + 1}`,
    String(1000 + i),
    String(50 + i),
  ]);
}

function createMockServices(rowCount: number): SessionServices {
  return {
    msadsService: {} as any,
    msadsReportingService: {
      downloadReport: vi.fn().mockImplementation(async (_url: string, fetchLimit: number) => {
        const rows = makeRows(rowCount).slice(0, fetchLimit);
        return { headers: HEADERS, rows, totalRows: rowCount };
      }),
    } as any,
  } as any;
}

describe("DownloadReportInputSchema", () => {
  it("defaults to summary mode when no params are passed", () => {
    const result = DownloadReportInputSchema.safeParse({
      downloadUrl: "https://download.example.com/report.csv",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe("summary");
    }
  });

  it("accepts mode rows with maxRows and offset", () => {
    const result = DownloadReportInputSchema.safeParse({
      downloadUrl: "https://download.example.com/report.csv",
      mode: "rows",
      maxRows: 50,
      offset: 100,
      columns: ["CampaignName", "Impressions"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid downloadUrl", () => {
    expect(
      DownloadReportInputSchema.safeParse({ downloadUrl: "not-a-url" }).success
    ).toBe(false);
  });
});

describe("msads_download_report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a summary preview of 10 rows by default", async () => {
    mockResolveSession.mockReturnValue(createMockServices(120));

    const result = await downloadReportLogic(
      { downloadUrl: "https://download.example.com/report.csv", mode: "summary" } as any,
      { requestId: "req-1" }
    );

    expect(result.mode).toBe("summary");
    expect(result.previewRows).toHaveLength(10);
    expect(result.totalRows).toBe(120);
    expect(result.truncated).toBe(true);
    expect(result.nextOffset).toBe(10);
  });

  it("returns up to 50 rows by default in rows mode", async () => {
    mockResolveSession.mockReturnValue(createMockServices(120));

    const result = await downloadReportLogic(
      { downloadUrl: "https://download.example.com/report.csv", mode: "rows" } as any,
      { requestId: "req-1" }
    );

    expect(result.mode).toBe("rows");
    expect(result.rows).toHaveLength(50);
    expect(result.returnedRows).toBe(50);
  });

  it("caps maxRows at 200 and emits a cap warning", async () => {
    mockResolveSession.mockReturnValue(createMockServices(500));

    const result = await downloadReportLogic(
      {
        downloadUrl: "https://download.example.com/report.csv",
        mode: "rows",
        maxRows: 1000,
      } as any,
      { requestId: "req-1" }
    );

    expect(result.returnedRows).toBe(200);
    expect(result.warnings.some((w) => w.includes("200"))).toBe(true);
  });

  it("paginates via offset", async () => {
    mockResolveSession.mockReturnValue(createMockServices(120));

    const page1 = await downloadReportLogic(
      {
        downloadUrl: "https://download.example.com/report.csv",
        mode: "rows",
        maxRows: 50,
      } as any,
      { requestId: "req-1" }
    );
    expect(page1.nextOffset).toBe(50);

    const page2 = await downloadReportLogic(
      {
        downloadUrl: "https://download.example.com/report.csv",
        mode: "rows",
        maxRows: 50,
        offset: 50,
      } as any,
      { requestId: "req-1" }
    );
    expect(page2.returnedRows).toBe(50);
    expect(page2.nextOffset).toBe(100);
  });

  it("projects rows to selected columns when provided", async () => {
    mockResolveSession.mockReturnValue(createMockServices(5));

    const result = await downloadReportLogic(
      {
        downloadUrl: "https://download.example.com/report.csv",
        mode: "rows",
        columns: ["CampaignName"],
      } as any,
      { requestId: "req-1" }
    );

    expect(result.selectedColumns).toEqual(["CampaignName"]);
    expect(Object.keys(result.rows![0]!)).toEqual(["CampaignName"]);
  });
});
