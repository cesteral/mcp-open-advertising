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
  submitReportLogic,
  submitReportResponseFormatter,
} from "../../src/mcp-server/tools/definitions/submit-report.tool.js";

const mockSubmitReport = vi.fn();

beforeEach(() => {
  mockSubmitReport.mockReset();
  mockResolveSession.mockReturnValue({
    amazonDspReportingService: {
      submitReport: mockSubmitReport,
    },
  } as any);
});

const baseContext = { requestId: "test-req" } as any;
const baseSdkContext = { sessionId: "test-session" } as any;

describe("submitReportLogic", () => {
  it("returns taskId and timestamp", async () => {
    mockSubmitReport.mockResolvedValueOnce({ taskId: "rpt-new-1" });

    const result = await submitReportLogic(
      {
        startDate: "2026-03-01",
        endDate: "2026-03-04",
        type: "CAMPAIGN",
        dimensions: ["ORDER", "LINE_ITEM"],
        metrics: ["impressions", "totalCost"],
        timeUnit: "DAILY",
      },
      baseContext,
      baseSdkContext
    );

    expect(result.taskId).toBe("rpt-new-1");
    expect(result.timestamp).toBeDefined();
  });

  it("passes the flat /dsp/reports config shape to submitReport", async () => {
    mockSubmitReport.mockResolvedValueOnce({ taskId: "rpt-cfg" });

    await submitReportLogic(
      {
        startDate: "2026-03-01",
        endDate: "2026-03-04",
        type: "CAMPAIGN",
        dimensions: ["ORDER"],
        metrics: ["impressions", "totalCost"],
        timeUnit: "SUMMARY",
      },
      baseContext,
      baseSdkContext
    );

    expect(mockSubmitReport).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: "2026-03-01",
        endDate: "2026-03-04",
        type: "CAMPAIGN",
        dimensions: ["ORDER"],
        metrics: ["impressions", "totalCost"],
        timeUnit: "SUMMARY",
      }),
      baseContext
    );
  });

  it("calls submitReport once, not getReport", async () => {
    mockSubmitReport.mockResolvedValueOnce({ taskId: "rpt-sub" });

    await submitReportLogic(
      {
        startDate: "2026-03-01",
        endDate: "2026-03-04",
        type: "CAMPAIGN",
        dimensions: ["LINE_ITEM"],
        metrics: ["impressions"],
        timeUnit: "DAILY",
      },
      baseContext,
      baseSdkContext
    );

    expect(mockSubmitReport).toHaveBeenCalledOnce();
  });
});

describe("submitReportResponseFormatter", () => {
  it("includes guidance to use amazon_dsp_check_report_status", () => {
    const content = submitReportResponseFormatter({
      taskId: "rpt-abc",
      timestamp: new Date().toISOString(),
    });

    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("text");
    expect(content[0].text).toContain("Report submitted: rpt-abc");
    expect(content[0].text).toContain("amazon_dsp_check_report_status");
  });
});
