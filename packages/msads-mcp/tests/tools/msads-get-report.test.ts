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
  GetReportInputSchema,
  getReportLogic,
} from "../../src/mcp-server/tools/definitions/get-report.tool.js";
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
      getReport: vi.fn().mockImplementation(async (_req: any, fetchLimit: number) => {
        const rows = makeRows(rowCount).slice(0, fetchLimit);
        return {
          reportRequestId: "rpt-req-1",
          headers: HEADERS,
          rows,
          totalRows: rowCount,
        };
      }),
    } as any,
  } as any;
}

describe("GetReportInputSchema", () => {
  it("rejects when both date and preset are missing", () => {
    expect(
      GetReportInputSchema.safeParse({
        reportType: "CampaignPerformanceReportRequest",
        accountId: "123",
        columns: ["CampaignName"],
      }).success
    ).toBe(false);
  });

  it("accepts datePreset + bounded view params", () => {
    const result = GetReportInputSchema.safeParse({
      reportType: "CampaignPerformanceReportRequest",
      accountId: "123",
      columns: ["CampaignName"],
      datePreset: "LAST_30_DAYS",
      mode: "rows",
      maxRows: 50,
    });
    expect(result.success).toBe(true);
  });
});

describe("msads_get_report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the report request id and a summary preview by default", async () => {
    mockResolveSession.mockReturnValue(createMockServices(120));

    const result = await getReportLogic(
      {
        reportType: "CampaignPerformanceReportRequest",
        accountId: "123",
        columns: ["CampaignName", "Impressions", "Clicks"],
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      } as any,
      { requestId: "req-1" }
    );

    expect(result.reportRequestId).toBe("rpt-req-1");
    expect(result.mode).toBe("summary");
    expect(result.previewRows).toHaveLength(10);
    expect(result.totalRows).toBe(120);
  });

  it("respects maxRows cap of 200 and warns when exceeded", async () => {
    mockResolveSession.mockReturnValue(createMockServices(500));

    const result = await getReportLogic(
      {
        reportType: "CampaignPerformanceReportRequest",
        accountId: "123",
        columns: ["CampaignName"],
        datePreset: "LAST_30_DAYS",
        mode: "rows",
        maxRows: 1000,
      } as any,
      { requestId: "req-1" }
    );

    expect(result.returnedRows).toBe(200);
    expect(result.warnings.some((w) => w.includes("200"))).toBe(true);
  });
});
