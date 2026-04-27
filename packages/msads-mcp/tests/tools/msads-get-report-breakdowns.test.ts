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
  GetReportBreakdownsInputSchema,
  getReportBreakdownsLogic,
} from "../../src/mcp-server/tools/definitions/get-report-breakdowns.tool.js";
import type { SessionServices } from "../../src/services/session-services.js";

const HEADERS = ["CampaignName", "Impressions", "Clicks", "DeviceOS", "Network"];

function makeRows(count: number): string[][] {
  return Array.from({ length: count }, (_, i) => [
    `Campaign ${i + 1}`,
    String(1000 + i),
    String(50 + i),
    i % 2 === 0 ? "iOS" : "Android",
    i % 3 === 0 ? "Search" : "Audience",
  ]);
}

function createMockServices(rowCount: number) {
  return {
    msadsService: {} as any,
    msadsReportingService: {
      getReport: vi.fn().mockImplementation(async (_req: any, fetchLimit: number) => {
        const rows = makeRows(rowCount).slice(0, fetchLimit);
        return {
          reportRequestId: "rpt-req-2",
          headers: HEADERS,
          rows,
          totalRows: rowCount,
        };
      }),
    } as any,
  } as any as SessionServices;
}

describe("GetReportBreakdownsInputSchema", () => {
  it("requires breakdownColumns to be non-empty", () => {
    expect(
      GetReportBreakdownsInputSchema.safeParse({
        reportType: "CampaignPerformanceReportRequest",
        accountId: "123",
        columns: ["CampaignName"],
        breakdownColumns: [],
        datePreset: "LAST_30_DAYS",
      }).success
    ).toBe(false);
  });

  it("accepts a valid breakdown request", () => {
    expect(
      GetReportBreakdownsInputSchema.safeParse({
        reportType: "CampaignPerformanceReportRequest",
        accountId: "123",
        columns: ["CampaignName", "Impressions"],
        breakdownColumns: ["DeviceOS", "Network"],
        datePreset: "LAST_30_DAYS",
        mode: "rows",
        maxRows: 50,
      }).success
    ).toBe(true);
  });
});

describe("msads_get_report_breakdowns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges base and breakdown columns and returns appliedColumns", async () => {
    const services = createMockServices(20);
    mockResolveSession.mockReturnValue(services);

    const result = await getReportBreakdownsLogic(
      {
        reportType: "CampaignPerformanceReportRequest",
        accountId: "123",
        columns: ["CampaignName", "Impressions"],
        breakdownColumns: ["DeviceOS", "Network"],
        datePreset: "LAST_30_DAYS",
      } as any,
      { requestId: "req-1" }
    );

    expect(result.appliedColumns).toEqual(["CampaignName", "Impressions", "DeviceOS", "Network"]);
    expect((services.msadsReportingService.getReport as any).mock.calls[0][0].columns).toEqual([
      "CampaignName",
      "Impressions",
      "DeviceOS",
      "Network",
    ]);
  });

  it("deduplicates breakdownColumns that overlap with base columns", async () => {
    const services = createMockServices(5);
    mockResolveSession.mockReturnValue(services);

    const result = await getReportBreakdownsLogic(
      {
        reportType: "CampaignPerformanceReportRequest",
        accountId: "123",
        columns: ["CampaignName", "DeviceOS"],
        breakdownColumns: ["DeviceOS", "Network"],
        datePreset: "LAST_30_DAYS",
      } as any,
      { requestId: "req-1" }
    );

    expect(result.appliedColumns).toEqual(["CampaignName", "DeviceOS", "Network"]);
  });

  it("returns a bounded preview by default", async () => {
    mockResolveSession.mockReturnValue(createMockServices(120));

    const result = await getReportBreakdownsLogic(
      {
        reportType: "CampaignPerformanceReportRequest",
        accountId: "123",
        columns: ["CampaignName"],
        breakdownColumns: ["DeviceOS"],
        datePreset: "LAST_30_DAYS",
      } as any,
      { requestId: "req-1" }
    );

    expect(result.mode).toBe("summary");
    expect(result.previewRows).toHaveLength(10);
    expect(result.totalRows).toBe(120);
  });
});
