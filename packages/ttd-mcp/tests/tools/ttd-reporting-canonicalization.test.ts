// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReportStatusSchema } from "@cesteral/shared";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

// fetchWithTimeout lives in the shared package — mock it directly.
vi.mock("@cesteral/shared", async () => {
  const actual = await vi.importActual<typeof import("@cesteral/shared")>(
    "@cesteral/shared",
  );
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
  };
});

import { checkReportStatusLogic } from "../../src/mcp-server/tools/definitions/check-report-status.tool.js";
import { downloadReportLogic } from "../../src/mcp-server/tools/definitions/download-report.tool.js";
import { fetchWithTimeout } from "@cesteral/shared";

function createMockContext() {
  return {
    requestId: "req-123",
    timestamp: new Date().toISOString(),
    operation: "test",
  } as any;
}

function createMockSdkContext(sessionId = "session-123") {
  return { sessionId } as any;
}

describe("ttd_check_report_status canonical shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveSessionServices.mockReturnValue({
      ttdReportingService: {
        checkReportExecution: vi.fn().mockResolvedValue({
          reportScheduleId: "sched-1",
          state: "Complete",
          execution: { ReportExecutionState: "Complete" },
          downloadUrl: "https://files.ttd.com/report.csv",
        }),
      },
    });
  });

  it("returns a ReportStatusSchema-conformant payload (Complete)", async () => {
    const result = await checkReportStatusLogic(
      { reportScheduleId: "sched-1" },
      createMockContext(),
      createMockSdkContext(),
    );

    // The canonical subset must validate against ReportStatusSchema.
    const canonical = {
      state: result.state,
      ...(result.downloadUrl ? { downloadUrl: result.downloadUrl } : {}),
    };
    expect(() => ReportStatusSchema.parse(canonical)).not.toThrow();
    expect(result.state).toBe("complete");
  });

  it("maps TTD 'Pending' to canonical 'pending'", async () => {
    mockResolveSessionServices.mockReturnValue({
      ttdReportingService: {
        checkReportExecution: vi.fn().mockResolvedValue({
          reportScheduleId: "sched-2",
          state: "Pending",
          execution: {},
        }),
      },
    });

    const result = await checkReportStatusLogic(
      { reportScheduleId: "sched-2" },
      createMockContext(),
      createMockSdkContext(),
    );
    expect(result.state).toBe("pending");
    expect(result.isComplete).toBe(false);
  });

  it("maps TTD 'Failed' to canonical 'failed'", async () => {
    mockResolveSessionServices.mockReturnValue({
      ttdReportingService: {
        checkReportExecution: vi.fn().mockResolvedValue({
          reportScheduleId: "sched-3",
          state: "Failed",
          execution: { ErrorMessage: "bad query" },
        }),
      },
    });

    const result = await checkReportStatusLogic(
      { reportScheduleId: "sched-3" },
      createMockContext(),
      createMockSdkContext(),
    );
    expect(result.state).toBe("failed");
  });
});

describe("ttd_download_report computed metrics flag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveSessionServices.mockReturnValue({
      authAdapter: {
        getAccessToken: vi.fn().mockResolvedValue("test-token"),
      },
    });
  });

  const CSV =
    "AdvertiserId,Impressions,Clicks,TotalCost,TotalConversions,TotalConversionsValue\n" +
    "adv-1,10000,200,100,4,400\n";

  function mockCsvResponse() {
    const bytes = new TextEncoder().encode(CSV);
    (fetchWithTimeout as any).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: (name: string) => (name === "content-type" ? "text/csv" : null) },
      arrayBuffer: async () => bytes.buffer.slice(0),
    });
  }

  it("does not emit computed-metric columns by default", async () => {
    mockCsvResponse();
    const result = await downloadReportLogic(
      {
        downloadUrl: "https://reports.thetradedesk.com/results/x/report.csv",
        mode: "rows",
        maxRows: 10,
        includeComputedMetrics: false,
      },
      createMockContext(),
      createMockSdkContext(),
    );
    expect(result.headers).not.toContain("cpa");
    expect(result.headers).not.toContain("roas");
  });

  it("emits computed-metric columns when flag is true", async () => {
    mockCsvResponse();
    const result = await downloadReportLogic(
      {
        downloadUrl: "https://reports.thetradedesk.com/results/x/report.csv",
        mode: "rows",
        maxRows: 10,
        includeComputedMetrics: true,
      },
      createMockContext(),
      createMockSdkContext(),
    );
    expect(result.headers).toEqual(
      expect.arrayContaining(["cpa", "roas", "cpm", "ctr", "cpc"]),
    );
    const row = (result.rows ?? [])[0] ?? {};
    expect(row.cpa).toBe("25");
    expect(row.roas).toBe("4");
  });
});
