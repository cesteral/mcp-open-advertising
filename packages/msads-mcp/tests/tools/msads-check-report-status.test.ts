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
  CheckReportStatusInputSchema,
  checkReportStatusLogic,
  checkReportStatusResponseFormatter,
} from "../../src/mcp-server/tools/definitions/check-report-status.tool.js";
import type { SessionServices } from "../../src/services/session-services.js";

function createMockServices(status: string, downloadUrl?: string): SessionServices {
  return {
    msadsService: {} as any,
    msadsReportingService: {
      checkReportStatus: vi.fn().mockResolvedValue({ status, downloadUrl }),
    } as any,
  } as any;
}

describe("CheckReportStatusInputSchema", () => {
  it("requires reportRequestId", () => {
    expect(CheckReportStatusInputSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a request id", () => {
    expect(CheckReportStatusInputSchema.safeParse({ reportRequestId: "rpt-1" }).success).toBe(true);
  });
});

describe("msads_check_report_status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns canonical 'running' state when Pending", async () => {
    mockResolveSession.mockReturnValue(createMockServices("Pending"));

    const result = await checkReportStatusLogic(
      { reportRequestId: "rpt-1" },
      { requestId: "req-1" }
    );

    expect(result.state).toBe("running");
    expect(result.rawStatus).toBe("Pending");
    expect(result.isComplete).toBe(false);
    expect(result.downloadUrl).toBeUndefined();
  });

  it("returns canonical 'complete' state with downloadUrl when Success", async () => {
    mockResolveSession.mockReturnValue(
      createMockServices("Success", "https://download.example.com/report.csv")
    );

    const result = await checkReportStatusLogic(
      { reportRequestId: "rpt-1" },
      { requestId: "req-1" }
    );

    expect(result.state).toBe("complete");
    expect(result.rawStatus).toBe("Success");
    expect(result.isComplete).toBe(true);
    expect(result.downloadUrl).toBe("https://download.example.com/report.csv");
  });

  it("formats running state with a poll-again hint", () => {
    const formatted = checkReportStatusResponseFormatter({
      reportRequestId: "rpt-1",
      state: "running",
      rawStatus: "Pending",
      isComplete: false,
      timestamp: new Date().toISOString(),
    });

    expect(formatted[0]!.text).toContain("still processing");
  });

  it("formats complete state with a downloadUrl and follow-up hint", () => {
    const formatted = checkReportStatusResponseFormatter({
      reportRequestId: "rpt-1",
      state: "complete",
      rawStatus: "Success",
      isComplete: true,
      downloadUrl: "https://download.example.com/report.csv",
      timestamp: new Date().toISOString(),
    });

    expect(formatted[0]!.text).toContain("https://download.example.com/report.csv");
    expect(formatted[0]!.text).toContain("msads_download_report");
  });
});
