import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  createTemplateScheduleLogic,
  CreateTemplateScheduleInputSchema,
} from "../../src/mcp-server/tools/definitions/create-template-schedule.tool.js";
import {
  getReportTemplateLogic,
} from "../../src/mcp-server/tools/definitions/get-report-template.tool.js";
import {
  listReportTemplatesLogic,
} from "../../src/mcp-server/tools/definitions/list-report-templates.tool.js";

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

describe("ttd report template tools", () => {
  let mockTtdService: Record<string, ReturnType<typeof vi.fn>>;
  let mockTtdReportingService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTtdService = {
      graphqlQuery: vi.fn(),
    };

    mockTtdReportingService = {
      listReportTemplates: vi.fn(),
    };

    mockResolveSessionServices.mockReturnValue({
      ttdService: mockTtdService,
      ttdReportingService: mockTtdReportingService,
    });
  });

  it("accepts advertiserIds in template schedule reportFilters", () => {
    const result = CreateTemplateScheduleInputSchema.safeParse({
      templateId: "tpl-123",
      reportName: "Advertiser scoped report",
      startDate: "2025-10-10T00:00:00Z",
      frequency: "SINGLE_RUN",
      dateRange: "LAST14_DAYS",
      reportFilters: [
        {
          reportType: "60",
          advertiserIds: ["adv-111", "adv-222"],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("validates documented schedule enum-like inputs", () => {
    const result = CreateTemplateScheduleInputSchema.safeParse({
      templateId: "tpl-123",
      reportName: "Validated report",
      startDate: "2025-10-10T00:00:00Z",
      frequency: "SINGLE_RUN",
      dateRange: "LAST14_DAYS",
      timezone: "America/New_York",
      format: "EXCEL",
      dateFormat: "International",
      numericFormat: "US",
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid timezone and format literals", () => {
    const result = CreateTemplateScheduleInputSchema.safeParse({
      templateId: "tpl-123",
      reportName: "Invalid report",
      startDate: "2025-10-10T00:00:00Z",
      frequency: "SINGLE_RUN",
      dateRange: "LAST14_DAYS",
      timezone: "Mars/Olympus_Mons",
      format: "CSV",
    });

    expect(result.success).toBe(false);
  });

  it("passes advertiserIds through to the GraphQL mutation", async () => {
    mockTtdService.graphqlQuery.mockResolvedValueOnce({
      data: {
        myReportsTemplateScheduleCreate: {
          data: { scheduleId: "sched-123" },
          errors: [],
        },
      },
    });

    await createTemplateScheduleLogic(
      {
        templateId: "tpl-123",
        reportName: "Advertiser scoped report",
        startDate: "2025-10-10T00:00:00Z",
        frequency: "SINGLE_RUN",
        dateRange: "LAST14_DAYS",
        reportFilters: [
          {
            reportType: "60",
            advertiserIds: ["adv-111", "adv-222"],
          },
        ],
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockTtdService.graphqlQuery).toHaveBeenCalledWith(
      expect.stringContaining("myReportsTemplateScheduleCreate"),
      expect.objectContaining({
        input: expect.objectContaining({
          reportFilters: [
            {
              reportType: "60",
              advertiserIds: ["adv-111", "adv-222"],
            },
          ],
        }),
      }),
      expect.any(Object)
    );
  });

  it("returns report template result sets with reportTypeId and columnId values", async () => {
    mockTtdService.graphqlQuery.mockResolvedValueOnce({
      data: {
        derivedReportTemplate: {
          requestedReportTemplateId: "tpl-123",
          isDerived: false,
          name: "Weekly Report",
          reportFormatType: "EXCEL",
          resultSets: [
            {
              name: "Performance",
              reportType: { id: "60", name: "Campaign" },
              fields: [
                {
                  columnId: "21",
                  name: "Campaign Name",
                  columnOrder: 1,
                  includedInPivot: true,
                },
              ],
              metrics: [
                {
                  columnId: "7",
                  name: "Impressions",
                  columnOrder: 2,
                  includedInPivot: true,
                },
              ],
            },
          ],
        },
      },
    });

    const result = await getReportTemplateLogic(
      { id: "tpl-123" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.resultSets?.[0]?.name).toBe("Performance");
    expect(result.resultSets?.[0]?.reportTypeId).toBe("60");
    expect(result.resultSets?.[0]?.fields?.[0]?.columnId).toBe("21");
    expect(result.resultSets?.[0]?.metrics?.[0]?.columnId).toBe("7");
  });

  it("uses GraphQL pagination when no legacy offset is provided", async () => {
    mockTtdService.graphqlQuery.mockResolvedValueOnce({
      data: {
        myReportsReportTemplates: {
          totalCount: 2,
          pageInfo: { hasNextPage: true, endCursor: "cursor-2" },
          nodes: [{ id: "tpl-1", name: "Template 1", format: "EXCEL" }],
        },
      },
    });

    const result = await listReportTemplatesLogic(
      { first: 10 },
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockTtdService.graphqlQuery).toHaveBeenCalledWith(
      expect.stringContaining("myReportsReportTemplates"),
      { first: 10, after: undefined },
      expect.any(Object)
    );
    expect(result.templates).toHaveLength(1);
    expect(result.hasNextPage).toBe(true);
    expect(result.endCursor).toBe("cursor-2");
  });

  it("falls back to the legacy REST listing when pageStartIndex is used", async () => {
    mockTtdReportingService.listReportTemplates.mockResolvedValueOnce({
      Result: [{ ReportTemplateId: "tpl-legacy" }],
      TotalFilteredCount: 1,
    });

    const result = await listReportTemplatesLogic(
      { pageSize: 10, pageStartIndex: 10 },
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockTtdReportingService.listReportTemplates).toHaveBeenCalledWith(
      { PageSize: 10, PageStartIndex: 10 },
      expect.any(Object)
    );
    expect(mockTtdService.graphqlQuery).not.toHaveBeenCalled();
    expect(result.templates).toEqual([{ ReportTemplateId: "tpl-legacy" }]);
  });
});
