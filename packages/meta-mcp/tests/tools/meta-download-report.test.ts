import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  downloadReportLogic,
  downloadReportResponseFormatter,
} from "../../src/mcp-server/tools/definitions/download-report.tool.js";

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

describe("downloadReportLogic", () => {
  let mockMetaInsightsService: { getReportResults: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockMetaInsightsService = {
      getReportResults: vi.fn(),
    };

    mockResolveSessionServices.mockReturnValue({
      metaInsightsService: mockMetaInsightsService,
    });
  });

  it("returns fetchedAllRows metadata from the service", async () => {
    mockMetaInsightsService.getReportResults.mockResolvedValue({
      data: [{ id: "1" }, { id: "2" }],
      fetchedAllRows: true,
      nextCursor: undefined,
    });

    const result = await downloadReportLogic(
      {
        reportRunId: "report-123",
        maxRows: 100,
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result).toMatchObject({
      reportRunId: "report-123",
      totalResults: 2,
      fetchedAllRows: true,
      nextCursor: undefined,
    });
  });

  it("preserves the continuation cursor when results were truncated", async () => {
    mockMetaInsightsService.getReportResults.mockResolvedValue({
      data: [{ id: "1" }],
      fetchedAllRows: false,
      nextCursor: "cursor-2",
    });

    const result = await downloadReportLogic(
      {
        reportRunId: "report-123",
        maxRows: 1,
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result).toMatchObject({
      reportRunId: "report-123",
      totalResults: 1,
      fetchedAllRows: false,
      nextCursor: "cursor-2",
    });
  });
});

describe("downloadReportResponseFormatter", () => {
  it("omits truncation text when all rows were fetched", () => {
    const result = {
      reportRunId: "report-123",
      results: [{ id: "1" }],
      totalResults: 1,
      fetchedAllRows: true,
      nextCursor: undefined,
      timestamp: new Date().toISOString(),
    };

    const content = downloadReportResponseFormatter(result);
    expect((content[0] as any).text).not.toContain("Results were capped");
  });

  it("mentions truncation and the continuation cursor when maxRows capped the result set", () => {
    const result = {
      reportRunId: "report-123",
      results: [{ id: "1" }],
      totalResults: 1,
      fetchedAllRows: false,
      nextCursor: "cursor-2",
      timestamp: new Date().toISOString(),
    };

    const content = downloadReportResponseFormatter(result);
    expect((content[0] as any).text).toContain("Results were capped before the full report was exhausted");
    expect((content[0] as any).text).toContain("cursor-2");
  });
});
