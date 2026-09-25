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

import { checkReportStatusLogic } from "../../src/mcp-server/tools/definitions/check-report-status.tool.js";
import { downloadReportLogic } from "../../src/mcp-server/tools/definitions/download-report.tool.js";

function createMockContext() {
  return {
    requestId: "req-1",
    timestamp: new Date().toISOString(),
    operation: "test",
  } as any;
}

function createMockSdkContext(sessionId = "s-1") {
  return { sessionId } as any;
}

describe("meta_check_report_status canonical shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps 'Job Completed' to canonical 'complete' and validates ReportStatusSchema", async () => {
    mockResolveSessionServices.mockReturnValue({
      metaInsightsService: {
        checkReportStatus: vi.fn().mockResolvedValue({
          reportRunId: "rr-1",
          status: "Job Completed",
          asyncPercentCompletion: 100,
        }),
      },
    });

    const result = await checkReportStatusLogic(
      { reportRunId: "rr-1" },
      createMockContext(),
      createMockSdkContext()
    );
    expect(result.state).toBe("complete");
    expect(result.isComplete).toBe(true);
    expect(result.rawStatus).toBe("Job Completed");
    expect(result.progress).toBeCloseTo(1);

    const canonical = {
      state: result.state,
      ...(result.progress != null ? { progress: result.progress } : {}),
    };
    expect(() => ReportStatusSchema.parse(canonical)).not.toThrow();
  });

  it("maps 'Job Failed' to canonical 'failed'", async () => {
    mockResolveSessionServices.mockReturnValue({
      metaInsightsService: {
        checkReportStatus: vi.fn().mockResolvedValue({
          reportRunId: "rr-2",
          status: "Job Failed",
          errorCode: 100,
          errorMessage: "boom",
        }),
      },
    });

    const result = await checkReportStatusLogic(
      { reportRunId: "rr-2" },
      createMockContext(),
      createMockSdkContext()
    );
    expect(result.state).toBe("failed");
    expect(result.errorCode).toBe(100);
  });

  it("maps 'Job Running' to canonical 'running'", async () => {
    mockResolveSessionServices.mockReturnValue({
      metaInsightsService: {
        checkReportStatus: vi.fn().mockResolvedValue({
          reportRunId: "rr-3",
          status: "Job Running",
          asyncPercentCompletion: 42,
        }),
      },
    });

    const result = await checkReportStatusLogic(
      { reportRunId: "rr-3" },
      createMockContext(),
      createMockSdkContext()
    );
    expect(result.state).toBe("running");
    expect(result.progress).toBeCloseTo(0.42);
  });
});

describe("meta_download_report computed metrics flag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Realistic Meta async-report row: action fields are list<AdsActionStats>
  // (facebook-python-business-sdk adsinsights.py), not scalars.
  const META_ROWS = [
    {
      impressions: "10000",
      clicks: "200",
      spend: "100",
      actions: [
        { action_type: "link_click", value: "150" },
        { action_type: "offsite_conversion.fb_pixel_purchase", value: "4" },
      ],
      action_values: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "400" }],
      conversions: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "4" }],
    },
  ];

  function mockService() {
    mockResolveSessionServices.mockReturnValue({
      metaInsightsService: {
        getReportResults: vi.fn().mockResolvedValue({
          data: META_ROWS,
          fetchedAllRows: true,
          nextCursor: undefined,
        }),
      },
    });
  }

  it("omits computed-metric columns by default", async () => {
    mockService();
    const result = await downloadReportLogic(
      {
        reportRunId: "rr-1",
        mode: "rows",
        maxRows: 10,
        includeComputedMetrics: false,
      },
      createMockContext(),
      createMockSdkContext()
    );
    expect(result.headers).not.toContain("cpa");
    expect(result.headers).not.toContain("roas");
  });

  it("emits computed-metric columns when flag is true", async () => {
    mockService();
    const result = await downloadReportLogic(
      {
        reportRunId: "rr-2",
        mode: "rows",
        maxRows: 10,
        includeComputedMetrics: true,
      },
      createMockContext(),
      createMockSdkContext()
    );
    const row = (result.rows ?? [])[0] ?? {};
    expect(row.cpa).toBe("25");
    expect(row.roas).toBe("4");
    expect(row.cpm).toBe("10");
    expect(row.ctr).toBe("2");
    expect(row.cpc).toBe("0.5");
    expect(row._computedMetricsWarnings).toBeUndefined();
  });

  it("keeps array-valued Meta fields intact when computing metrics", async () => {
    mockService();
    const result = await downloadReportLogic(
      {
        reportRunId: "rr-3",
        mode: "rows",
        maxRows: 10,
        includeComputedMetrics: true,
      },
      createMockContext(),
      createMockSdkContext()
    );
    const row = (result.rows ?? [])[0] ?? {};
    expect(row.actions).toEqual(META_ROWS[0]!.actions);
    expect(row.conversions).toEqual(META_ROWS[0]!.conversions);
    expect(JSON.stringify(row)).not.toContain("[object Object]");
  });

  it("flags missing action fields instead of silently computing zero conversions", async () => {
    mockResolveSessionServices.mockReturnValue({
      metaInsightsService: {
        getReportResults: vi.fn().mockResolvedValue({
          data: [{ impressions: "1000", clicks: "10", spend: "5" }],
          fetchedAllRows: true,
          nextCursor: undefined,
        }),
      },
    });
    const result = await downloadReportLogic(
      { reportRunId: "rr-4", mode: "rows", maxRows: 10, includeComputedMetrics: true },
      createMockContext(),
      createMockSdkContext()
    );
    const row = (result.rows ?? [])[0] ?? {};
    expect(row.cpa).toBe("");
    expect(row._computedMetricsWarnings).toBe("missing:conversions,missing:conversionValue");
  });
});
