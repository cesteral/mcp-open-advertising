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
  SubmitReportInputSchema,
  submitReportLogic,
  submitReportResponseFormatter,
} from "../../src/mcp-server/tools/definitions/submit-report.tool.js";

const mockContext = { requestId: "test-req" } as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SubmitReportInputSchema", () => {
  it("accepts valid input with required fields", () => {
    const result = SubmitReportInputSchema.safeParse({
      profileId: "123456",
      name: "Campaign Performance Report",
      type: "STANDARD",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing profileId", () => {
    const result = SubmitReportInputSchema.safeParse({
      name: "Test Report",
      type: "STANDARD",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty profileId", () => {
    const result = SubmitReportInputSchema.safeParse({
      profileId: "",
      name: "Test Report",
      type: "STANDARD",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const result = SubmitReportInputSchema.safeParse({
      profileId: "123456",
      type: "STANDARD",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing type", () => {
    const result = SubmitReportInputSchema.safeParse({
      profileId: "123456",
      name: "Test Report",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid report types", () => {
    const types = [
      "STANDARD",
      "REACH",
      "PATH_TO_CONVERSION",
      "CROSS_MEDIA_REACH",
      "FLOODLIGHT",
    ];

    for (const type of types) {
      const result = SubmitReportInputSchema.safeParse({
        profileId: "123456",
        name: "Test Report",
        type,
      });
      expect(result.success, `Expected type ${type} to be valid`).toBe(true);
    }
  });

  it("rejects invalid report type", () => {
    const result = SubmitReportInputSchema.safeParse({
      profileId: "123456",
      name: "Test Report",
      type: "INVALID_TYPE",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional criteria for STANDARD reports", () => {
    const result = SubmitReportInputSchema.safeParse({
      profileId: "123456",
      name: "Test Report",
      type: "STANDARD",
      criteria: {
        dateRange: { relativeDateRange: "LAST_30_DAYS" },
        dimensions: [{ name: "campaign" }],
        metricNames: ["impressions", "clicks"],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.criteria).toBeDefined();
      expect(result.data.criteria!.dateRange).toEqual({
        relativeDateRange: "LAST_30_DAYS",
      });
    }
  });

  it("accepts optional additionalConfig", () => {
    const result = SubmitReportInputSchema.safeParse({
      profileId: "123456",
      name: "Test Report",
      type: "STANDARD",
      additionalConfig: {
        format: "CSV",
        schedule: { active: false },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.additionalConfig).toBeDefined();
    }
  });

  it("accepts full input with reachCriteria for REACH reports", () => {
    const result = SubmitReportInputSchema.safeParse({
      profileId: "123456",
      name: "Full Report",
      type: "REACH",
      reachCriteria: {
        dateRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
        dimensions: [{ name: "campaign" }, { name: "advertiser" }],
        metricNames: ["impressions", "clicks", "mediaCost"],
      },
      additionalConfig: {
        format: "CSV",
      },
    });
    expect(result.success).toBe(true);
  });

  it("preserves criteria in parsed output", () => {
    const criteria = {
      dateRange: { relativeDateRange: "LAST_7_DAYS" },
      metricNames: ["impressions"],
    };
    const result = SubmitReportInputSchema.parse({
      profileId: "123456",
      name: "Test",
      type: "STANDARD",
      criteria,
    });
    expect(result.criteria).toEqual(criteria);
  });

  it("rejects criteria on non-standard report types", () => {
    const result = SubmitReportInputSchema.safeParse({
      profileId: "123456",
      name: "Test Report",
      type: "FLOODLIGHT",
      criteria: {
        metricNames: ["floodlightRevenue"],
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("submitReportLogic", () => {
  it("calls cm360ReportingService.createReport with merged config", async () => {
    mockState.cm360ReportingService.createReport.mockResolvedValue({
      reportId: "rpt-1",
      fileId: "file-1",
    });

    const input = {
      profileId: "123",
      name: "My Report",
      type: "STANDARD" as const,
      criteria: { dateRange: { relativeDateRange: "LAST_7_DAYS" } },
      additionalConfig: { format: "CSV" },
    };
    await submitReportLogic(input, mockContext);

    expect(mockState.cm360ReportingService.createReport).toHaveBeenCalledWith(
      "123",
      {
        format: "CSV",
        name: "My Report",
        type: "STANDARD",
        criteria: { dateRange: { relativeDateRange: "LAST_7_DAYS" } },
      },
      mockContext
    );
  });

  it("uses type-specific criteria fields and strips conflicting additional config", async () => {
    mockState.cm360ReportingService.createReport.mockResolvedValue({
      reportId: "rpt-1",
      fileId: "file-1",
    });

    const input = {
      profileId: "123",
      name: "Correct Name",
      type: "REACH" as const,
      reachCriteria: { metricNames: ["impressions"] },
      additionalConfig: { name: "Wrong Name", type: "WRONG", reachCriteria: {}, format: "CSV" },
    };
    await submitReportLogic(input, mockContext);

    const calledConfig = mockState.cm360ReportingService.createReport.mock.calls[0][1];
    expect(calledConfig.name).toBe("Correct Name");
    expect(calledConfig.type).toBe("REACH");
    expect(calledConfig.format).toBe("CSV");
    expect(calledConfig.criteria).toBeUndefined();
    expect(calledConfig.reachCriteria).toEqual({ metricNames: ["impressions"] });
  });

  it("returns reportId and fileId", async () => {
    mockState.cm360ReportingService.createReport.mockResolvedValue({
      reportId: "rpt-42",
      fileId: "file-99",
    });

    const result = await submitReportLogic(
      { profileId: "123", name: "Test", type: "STANDARD" as const },
      mockContext
    );

    expect(result.reportId).toBe("rpt-42");
    expect(result.fileId).toBe("file-99");
    expect(result.timestamp).toBeDefined();
  });

  it("handles missing criteria (not included in config)", async () => {
    mockState.cm360ReportingService.createReport.mockResolvedValue({
      reportId: "rpt-1",
      fileId: "file-1",
    });

    await submitReportLogic(
      { profileId: "123", name: "Test", type: "STANDARD" as const },
      mockContext
    );

    const calledConfig = mockState.cm360ReportingService.createReport.mock.calls[0][1];
    expect(calledConfig.criteria).toBeUndefined();
  });

  it("injects datePreset into the matching criteria field", async () => {
    mockState.cm360ReportingService.createReport.mockResolvedValue({
      reportId: "rpt-1",
      fileId: "file-1",
    });

    await submitReportLogic(
      {
        profileId: "123",
        name: "Cross Media Reach",
        type: "CROSS_MEDIA_REACH" as const,
        datePreset: "LAST_7_DAYS",
        crossMediaReachCriteria: {
          dimensions: [{ name: "campaign" }],
          metricNames: ["uniqueReach"],
          dimensionFilters: [],
        },
      },
      mockContext
    );

    const calledConfig = mockState.cm360ReportingService.createReport.mock.calls[0][1];
    expect(calledConfig.crossMediaReachCriteria.dateRange).toEqual({
      startDate: expect.any(String),
      endDate: expect.any(String),
    });
  });

  it("propagates service errors", async () => {
    mockState.cm360ReportingService.createReport.mockRejectedValue(new Error("Quota exceeded"));

    await expect(
      submitReportLogic(
        { profileId: "123", name: "Test", type: "STANDARD" as const },
        mockContext
      )
    ).rejects.toThrow("Quota exceeded");
  });
});

describe("submitReportResponseFormatter", () => {
  it("includes reportId and fileId", () => {
    const result = submitReportResponseFormatter({
      reportId: "rpt-42",
      fileId: "file-99",
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(result[0].text).toContain("rpt-42");
    expect(result[0].text).toContain("file-99");
  });

  it("includes usage instructions for next steps", () => {
    const result = submitReportResponseFormatter({
      reportId: "rpt-1",
      fileId: "file-1",
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(result[0].text).toContain("cm360_check_report_status");
    expect(result[0].text).toContain("cm360_download_report");
  });
});
