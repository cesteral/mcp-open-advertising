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
  checkReportStatusLogic,
  checkReportStatusResponseFormatter,
  CheckReportStatusInputSchema,
} from "../../src/mcp-server/tools/definitions/check-report-status.tool.js";

const mockContext = { requestId: "test-req" } as any;

describe("checkReportStatusLogic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("REPORT_AVAILABLE: returns canonical 'complete' state with downloadUrl", async () => {
    mockState.cm360ReportingService.checkReportFile.mockResolvedValue({
      reportId: "r1",
      fileId: "f1",
      status: "REPORT_AVAILABLE",
      file: { status: "REPORT_AVAILABLE" },
      downloadUrl: "https://example.com/download",
    });

    const result = await checkReportStatusLogic(
      { profileId: "123", reportId: "r1", fileId: "f1" },
      mockContext
    );

    expect(result.state).toBe("complete");
    expect(result.rawStatus).toBe("REPORT_AVAILABLE");
    expect(result.isComplete).toBe(true);
    expect(result.downloadUrl).toBe("https://example.com/download");
    expect(result.reportId).toBe("r1");
    expect(result.fileId).toBe("f1");
    expect(result.timestamp).toBeDefined();
  });

  it("PROCESSING: returns canonical 'running' state without downloadUrl", async () => {
    mockState.cm360ReportingService.checkReportFile.mockResolvedValue({
      reportId: "r1",
      fileId: "f1",
      status: "PROCESSING",
      file: { status: "PROCESSING" },
    });

    const result = await checkReportStatusLogic(
      { profileId: "123", reportId: "r1", fileId: "f1" },
      mockContext
    );

    expect(result.state).toBe("running");
    expect(result.rawStatus).toBe("PROCESSING");
    expect(result.isComplete).toBe(false);
    expect(result.downloadUrl).toBeUndefined();
  });

  it("calls checkReportFile with correct args", async () => {
    mockState.cm360ReportingService.checkReportFile.mockResolvedValue({
      reportId: "r1",
      fileId: "f1",
      status: "PROCESSING",
      file: {},
    });

    await checkReportStatusLogic(
      { profileId: "prof1", reportId: "rep1", fileId: "file1" },
      mockContext
    );

    expect(mockState.cm360ReportingService.checkReportFile).toHaveBeenCalledWith(
      "prof1",
      "rep1",
      "file1",
      mockContext
    );
  });

  it("propagates service errors", async () => {
    mockState.cm360ReportingService.checkReportFile.mockRejectedValue(new Error("Not found"));

    await expect(
      checkReportStatusLogic({ profileId: "123", reportId: "r1", fileId: "f1" }, mockContext)
    ).rejects.toThrow("Not found");
  });
});

describe("checkReportStatusResponseFormatter", () => {
  it("shows state and rawStatus in output", () => {
    const result = checkReportStatusResponseFormatter({
      reportId: "r1",
      fileId: "f1",
      state: "running",
      rawStatus: "PROCESSING",
      isComplete: false,
      file: {},
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(result).toHaveLength(1);
    expect(result[0].text).toContain("PROCESSING");
    expect(result[0].text).toContain("running");
  });

  it("shows download URL and usage hint when complete", () => {
    const result = checkReportStatusResponseFormatter({
      reportId: "r1",
      fileId: "f1",
      state: "complete",
      rawStatus: "REPORT_AVAILABLE",
      isComplete: true,
      file: {},
      downloadUrl: "https://example.com/download",
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(result[0].text).toContain("https://example.com/download");
    expect(result[0].text).toContain("cm360_download_report");
  });

  it("no download info when running", () => {
    const result = checkReportStatusResponseFormatter({
      reportId: "r1",
      fileId: "f1",
      state: "running",
      rawStatus: "PROCESSING",
      isComplete: false,
      file: {},
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(result[0].text).not.toContain("Download URL");
    expect(result[0].text).not.toContain("cm360_download_report");
  });
});

describe("CheckReportStatusInputSchema", () => {
  it("requires profileId, reportId, fileId", () => {
    expect(CheckReportStatusInputSchema.safeParse({}).success).toBe(false);
    expect(CheckReportStatusInputSchema.safeParse({ profileId: "1", reportId: "2" }).success).toBe(
      false
    );
    expect(CheckReportStatusInputSchema.safeParse({ profileId: "1", fileId: "3" }).success).toBe(
      false
    );
    expect(CheckReportStatusInputSchema.safeParse({ reportId: "2", fileId: "3" }).success).toBe(
      false
    );

    const valid = CheckReportStatusInputSchema.safeParse({
      profileId: "1",
      reportId: "2",
      fileId: "3",
    });
    expect(valid.success).toBe(true);
  });

  it("rejects empty strings", () => {
    expect(
      CheckReportStatusInputSchema.safeParse({
        profileId: "",
        reportId: "2",
        fileId: "3",
      }).success
    ).toBe(false);
    expect(
      CheckReportStatusInputSchema.safeParse({
        profileId: "1",
        reportId: "",
        fileId: "3",
      }).success
    ).toBe(false);
    expect(
      CheckReportStatusInputSchema.safeParse({
        profileId: "1",
        reportId: "2",
        fileId: "",
      }).success
    ).toBe(false);
  });
});
