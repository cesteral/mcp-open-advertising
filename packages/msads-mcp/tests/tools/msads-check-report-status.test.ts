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
    expect(
      CheckReportStatusInputSchema.safeParse({ reportRequestId: "rpt-1" }).success
    ).toBe(true);
  });
});

describe("msads_check_report_status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns Pending when the report is still processing", async () => {
    mockResolveSession.mockReturnValue(createMockServices("Pending"));

    const result = await checkReportStatusLogic(
      { reportRequestId: "rpt-1" },
      { requestId: "req-1" }
    );

    expect(result.status).toBe("Pending");
    expect(result.downloadUrl).toBeUndefined();
  });

  it("returns Success with downloadUrl when ready", async () => {
    mockResolveSession.mockReturnValue(
      createMockServices("Success", "https://download.example.com/report.csv")
    );

    const result = await checkReportStatusLogic(
      { reportRequestId: "rpt-1" },
      { requestId: "req-1" }
    );

    expect(result.status).toBe("Success");
    expect(result.downloadUrl).toBe("https://download.example.com/report.csv");
  });

  it("formats Pending status with a poll-again hint", () => {
    const formatted = checkReportStatusResponseFormatter({
      reportRequestId: "rpt-1",
      status: "Pending",
      timestamp: new Date().toISOString(),
    });

    expect(formatted[0]!.text).toContain("still processing");
  });

  it("formats Success status with a downloadUrl and follow-up hint", () => {
    const formatted = checkReportStatusResponseFormatter({
      reportRequestId: "rpt-1",
      status: "Success",
      downloadUrl: "https://download.example.com/report.csv",
      timestamp: new Date().toISOString(),
    });

    expect(formatted[0]!.text).toContain("https://download.example.com/report.csv");
    expect(formatted[0]!.text).toContain("msads_download_report");
  });
});
