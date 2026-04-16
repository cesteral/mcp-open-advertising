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
  SubmitReportInputSchema,
  submitReportLogic,
  submitReportResponseFormatter,
} from "../../src/mcp-server/tools/definitions/submit-report.tool.js";
import type { SessionServices } from "../../src/services/session-services.js";

function createMockServices(): SessionServices {
  return {
    msadsService: {} as any,
    msadsReportingService: {
      submitReport: vi.fn().mockResolvedValue("rpt-req-1"),
    } as any,
  } as any;
}

describe("SubmitReportInputSchema", () => {
  it("accepts a datePreset-based request", () => {
    const result = SubmitReportInputSchema.safeParse({
      reportType: "CampaignPerformanceReportRequest",
      accountId: "123",
      columns: ["CampaignName", "Impressions"],
      datePreset: "LAST_30_DAYS",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an explicit startDate/endDate", () => {
    const result = SubmitReportInputSchema.safeParse({
      reportType: "CampaignPerformanceReportRequest",
      accountId: "123",
      columns: ["CampaignName"],
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    expect(result.success).toBe(true);
  });

  it("rejects requests missing both datePreset and startDate/endDate", () => {
    const result = SubmitReportInputSchema.safeParse({
      reportType: "CampaignPerformanceReportRequest",
      accountId: "123",
      columns: ["CampaignName"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty columns", () => {
    const result = SubmitReportInputSchema.safeParse({
      reportType: "CampaignPerformanceReportRequest",
      accountId: "123",
      columns: [],
      datePreset: "LAST_30_DAYS",
    });
    expect(result.success).toBe(false);
  });
});

describe("msads_submit_report", () => {
  let mockServices: SessionServices;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServices = createMockServices();
    mockResolveSession.mockReturnValue(mockServices);
  });

  it("submits a report and returns the request id", async () => {
    const result = await submitReportLogic(
      {
        reportType: "CampaignPerformanceReportRequest",
        accountId: "123",
        columns: ["CampaignName", "Impressions"],
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      },
      { requestId: "req-1" }
    );

    expect(result.reportRequestId).toBe("rpt-req-1");
    expect(mockServices.msadsReportingService.submitReport).toHaveBeenCalledWith(
      expect.objectContaining({
        reportType: "CampaignPerformanceReportRequest",
        accountId: "123",
        columns: ["CampaignName", "Impressions"],
        dateRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
      }),
      { requestId: "req-1" }
    );
  });

  it("resolves datePreset to concrete dates before calling the service", async () => {
    await submitReportLogic(
      {
        reportType: "CampaignPerformanceReportRequest",
        accountId: "123",
        columns: ["CampaignName"],
        datePreset: "LAST_30_DAYS",
      },
      { requestId: "req-1" }
    );

    const call = (mockServices.msadsReportingService.submitReport as any).mock.calls[0][0];
    expect(call.dateRange.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(call.dateRange.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("formats the response with a follow-up hint", () => {
    const formatted = submitReportResponseFormatter({
      reportRequestId: "rpt-req-1",
      timestamp: new Date().toISOString(),
    });

    expect(formatted[0]!.text).toContain("rpt-req-1");
    expect(formatted[0]!.text).toContain("msads_check_report_status");
  });
});
