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
    "campaign",
    "placement",
    "ad",
    "creative",
    "site",
    "advertiser",
    "floodlightActivity",
    "floodlightConfiguration",
  ],
  getDeletableEntityTypeEnum: () => ["floodlightActivity"],
}));

import {
  getReportLogic,
  getReportResponseFormatter,
  GetReportInputSchema,
} from "../../src/mcp-server/tools/definitions/get-report.tool.js";

const mockContext = { requestId: "test-req" } as any;

describe("getReportLogic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls cm360ReportingService.runReport with merged config", async () => {
    mockState.cm360ReportingService.runReport.mockResolvedValue({
      reportId: "r1",
      fileId: "f1",
      file: {},
      downloadUrl: "https://example.com/download",
    });

    await getReportLogic(
      {
        profileId: "123",
        name: "Test Report",
        type: "STANDARD",
        criteria: { dateRange: { relativeDateRange: "LAST_7_DAYS" } },
        additionalConfig: { format: "CSV" },
      },
      mockContext
    );

    expect(mockState.cm360ReportingService.runReport).toHaveBeenCalledWith(
      "123",
      {
        format: "CSV",
        name: "Test Report",
        type: "STANDARD",
        criteria: { dateRange: { relativeDateRange: "LAST_7_DAYS" } },
      },
      mockContext
    );
  });

  it("uses reachCriteria for REACH reports", async () => {
    mockState.cm360ReportingService.runReport.mockResolvedValue({
      reportId: "r1",
      fileId: "f1",
      file: {},
    });

    await getReportLogic(
      {
        profileId: "123",
        name: "Reach Report",
        type: "REACH",
        reachCriteria: { metricNames: ["impressions"] },
        additionalConfig: {
          name: "Should Be Stripped",
          type: "Should Be Stripped",
          reachCriteria: { should: "be stripped" },
          format: "CSV",
        },
      },
      mockContext
    );

    const calledConfig = mockState.cm360ReportingService.runReport.mock.calls[0][1];
    expect(calledConfig.name).toBe("Reach Report");
    expect(calledConfig.type).toBe("REACH");
    expect(calledConfig.criteria).toBeUndefined();
    expect(calledConfig.reachCriteria).toEqual({ metricNames: ["impressions"] });
    expect(calledConfig.format).toBe("CSV");
  });

  it("injects datePreset into the matching criteria field", async () => {
    mockState.cm360ReportingService.runReport.mockResolvedValue({
      reportId: "r1",
      fileId: "f1",
      file: {},
    });

    await getReportLogic(
      {
        profileId: "123",
        name: "Floodlight Report",
        type: "FLOODLIGHT",
        datePreset: "LAST_7_DAYS",
        floodlightCriteria: { metricNames: ["floodlightRevenue"] },
      },
      mockContext
    );

    const calledConfig = mockState.cm360ReportingService.runReport.mock.calls[0][1];
    expect(calledConfig.floodlightCriteria.metricNames).toEqual(["floodlightRevenue"]);
    expect(calledConfig.floodlightCriteria.dateRange).toEqual({
      startDate: expect.any(String),
      endDate: expect.any(String),
    });
  });

  it("returns reportId, fileId, file, downloadUrl", async () => {
    mockState.cm360ReportingService.runReport.mockResolvedValue({
      reportId: "r1",
      fileId: "f1",
      file: { status: "REPORT_AVAILABLE" },
      downloadUrl: "https://example.com/dl",
    });

    const result = await getReportLogic(
      { profileId: "123", name: "Test", type: "STANDARD" },
      mockContext
    );

    expect(result.reportId).toBe("r1");
    expect(result.fileId).toBe("f1");
    expect(result.file).toEqual({ status: "REPORT_AVAILABLE" });
    expect(result.downloadUrl).toBe("https://example.com/dl");
    expect(result.timestamp).toBeDefined();
  });

  it("handles missing downloadUrl (undefined in result)", async () => {
    mockState.cm360ReportingService.runReport.mockResolvedValue({
      reportId: "r1",
      fileId: "f1",
      file: {},
    });

    const result = await getReportLogic(
      { profileId: "123", name: "Test", type: "STANDARD" },
      mockContext
    );

    expect(result.downloadUrl).toBeUndefined();
  });

  it("handles missing criteria (not included when undefined)", async () => {
    mockState.cm360ReportingService.runReport.mockResolvedValue({
      reportId: "r1",
      fileId: "f1",
      file: {},
    });

    await getReportLogic({ profileId: "123", name: "Test", type: "STANDARD" }, mockContext);

    const calledConfig = mockState.cm360ReportingService.runReport.mock.calls[0][1];
    expect(calledConfig).not.toHaveProperty("criteria");
  });

  it("handles empty additionalConfig", async () => {
    mockState.cm360ReportingService.runReport.mockResolvedValue({
      reportId: "r1",
      fileId: "f1",
      file: {},
    });

    await getReportLogic(
      {
        profileId: "123",
        name: "Test",
        type: "FLOODLIGHT",
        floodlightCriteria: { metricNames: ["floodlightRevenue"] },
        additionalConfig: {},
      },
      mockContext
    );

    const calledConfig = mockState.cm360ReportingService.runReport.mock.calls[0][1];
    expect(calledConfig.name).toBe("Test");
    expect(calledConfig.type).toBe("FLOODLIGHT");
  });

  it("propagates service errors", async () => {
    mockState.cm360ReportingService.runReport.mockRejectedValue(new Error("Report timeout"));

    await expect(
      getReportLogic({ profileId: "123", name: "Test", type: "STANDARD" }, mockContext)
    ).rejects.toThrow("Report timeout");
  });
});

describe("getReportResponseFormatter", () => {
  it("includes report ID and file ID", () => {
    const result = getReportResponseFormatter({
      reportId: "r123",
      fileId: "f456",
      file: {},
      downloadUrl: "https://example.com/dl",
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(result).toHaveLength(1);
    expect(result[0].text).toContain("r123");
    expect(result[0].text).toContain("f456");
  });

  it("shows download URL when present", () => {
    const result = getReportResponseFormatter({
      reportId: "r1",
      fileId: "f1",
      file: {},
      downloadUrl: "https://example.com/download",
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(result[0].text).toContain("https://example.com/download");
  });

  it("shows 'No download URL available yet' when missing", () => {
    const result = getReportResponseFormatter({
      reportId: "r1",
      fileId: "f1",
      file: {},
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(result[0].text).toContain("No download URL available yet");
  });
});

describe("GetReportInputSchema", () => {
  it("accepts all report types", () => {
    const types = ["STANDARD", "REACH", "PATH_TO_CONVERSION", "CROSS_MEDIA_REACH", "FLOODLIGHT"];

    for (const type of types) {
      const result = GetReportInputSchema.safeParse({
        profileId: "123",
        name: "Test",
        type,
      });
      expect(result.success, `Expected type ${type} to be valid`).toBe(true);
    }
  });

  it("rejects invalid report type", () => {
    const result = GetReportInputSchema.safeParse({
      profileId: "123",
      name: "Test",
      type: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  it("requires profileId and name", () => {
    expect(GetReportInputSchema.safeParse({ name: "Test", type: "STANDARD" }).success).toBe(false);
    expect(GetReportInputSchema.safeParse({ profileId: "123", type: "STANDARD" }).success).toBe(
      false
    );
  });

  it("criteria and additionalConfig are optional", () => {
    const result = GetReportInputSchema.safeParse({
      profileId: "123",
      name: "Test",
      type: "STANDARD",
    });
    expect(result.success).toBe(true);
  });

  it("rejects criteria on non-standard report types", () => {
    const result = GetReportInputSchema.safeParse({
      profileId: "123",
      name: "Test",
      type: "FLOODLIGHT",
      criteria: { metricNames: ["floodlightRevenue"] },
    });
    expect(result.success).toBe(false);
  });

  it("accepts crossMediaReachCriteria for CROSS_MEDIA_REACH", () => {
    const result = GetReportInputSchema.safeParse({
      profileId: "123",
      name: "Test",
      type: "CROSS_MEDIA_REACH",
      crossMediaReachCriteria: {
        dimensions: [{ name: "campaign" }],
        metricNames: ["uniqueReach"],
      },
    });
    expect(result.success).toBe(true);
  });
});
