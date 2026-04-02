import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  getContextLogic,
  getContextResponseFormatter,
} from "../../src/mcp-server/tools/definitions/get-context.tool.js";
import {
  getAdPreviewLogic,
  getAdPreviewResponseFormatter,
} from "../../src/mcp-server/tools/definitions/get-ad-preview.tool.js";
import {
  listReportSchedulesLogic,
} from "../../src/mcp-server/tools/definitions/list-report-schedules.tool.js";
import {
  getReportExecutionsLogic,
  getReportExecutionsResponseFormatter,
} from "../../src/mcp-server/tools/definitions/get-report-executions.tool.js";
import {
  cancelReportExecutionLogic,
  cancelReportExecutionResponseFormatter,
} from "../../src/mcp-server/tools/definitions/cancel-report-execution.tool.js";
import {
  rerunReportScheduleLogic,
} from "../../src/mcp-server/tools/definitions/rerun-report-schedule.tool.js";
import {
  updateReportScheduleLogic,
  updateReportScheduleResponseFormatter,
} from "../../src/mcp-server/tools/definitions/update-report-schedule.tool.js";
import {
  createReportTemplateLogic,
} from "../../src/mcp-server/tools/definitions/create-report-template.tool.js";
import {
  updateReportTemplateLogic,
} from "../../src/mcp-server/tools/definitions/update-report-template.tool.js";
import {
  getReportTemplateLogic,
} from "../../src/mcp-server/tools/definitions/get-report-template.tool.js";
import {
  createTemplateScheduleLogic,
  CreateTemplateScheduleInputSchema,
} from "../../src/mcp-server/tools/definitions/create-template-schedule.tool.js";
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

describe("ttd schedule/context/template tools", () => {
  let mockTtdService: Record<string, ReturnType<typeof vi.fn>>;
  let mockTtdReportingService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTtdService = {
      graphqlQuery: vi.fn(),
      getEntity: vi.fn(),
    };

    mockTtdReportingService = {
      listReportSchedules: vi.fn(),
    };

    mockResolveSessionServices.mockReturnValue({
      ttdService: mockTtdService,
      ttdReportingService: mockTtdReportingService,
    });
  });

  it("getContextLogic returns partner nodes from GraphQL", async () => {
    mockTtdService.graphqlQuery.mockResolvedValueOnce({
      data: {
        partners: {
          nodes: [{ id: "p1", name: "Partner One" }],
        },
      },
    });

    const result = await getContextLogic({}, createMockContext(), createMockSdkContext());

    expect(result.partners).toEqual([{ id: "p1", name: "Partner One" }]);
  });

  it("getContextResponseFormatter handles empty partner lists", () => {
    const text = getContextResponseFormatter({
      partners: [],
      timestamp: new Date().toISOString(),
    })[0].text;

    expect(text).toContain("No partners found");
  });

  it("getAdPreviewLogic falls back to hosted video click URLs", async () => {
    mockTtdService.getEntity.mockResolvedValueOnce({
      CreativeName: "Video Creative",
      CreativeType: "ThirdPartyVideo",
      ShareLink: "https://preview.example.com",
      TradeDeskHostedVideoAttributes: {
        ClickthroughUrl: "https://landing.example.com",
      },
    });

    const result = await getAdPreviewLogic(
      { creativeId: "cr-1" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.previewUrl).toBe("https://preview.example.com");
    expect(result.clickUrl).toBe("https://landing.example.com");
  });

  it("getAdPreviewResponseFormatter shows when preview URL is missing", () => {
    const text = getAdPreviewResponseFormatter({
      creativeId: "cr-1",
      creativeName: "No Preview",
    })[0].text;

    expect(text).toContain("No preview URL available");
  });

  it("listReportSchedulesLogic maps advertiser filters to REST query shape", async () => {
    mockTtdReportingService.listReportSchedules.mockResolvedValueOnce({
      Result: [{ ReportScheduleId: 1 }],
      TotalFilteredCount: 1,
    });

    const result = await listReportSchedulesLogic(
      { advertiserIds: ["adv-1"], pageSize: 25, pageStartIndex: 10 },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.schedules).toEqual([{ ReportScheduleId: 1 }]);
    expect(mockTtdReportingService.listReportSchedules).toHaveBeenCalledWith(
      {
        PageSize: 25,
        PageStartIndex: 10,
        AdvertiserFilters: [{ Type: "AdvertiserId", Value: "adv-1" }],
      },
      expect.any(Object)
    );
  });

  it("getReportExecutionsLogic supports single-schedule mode", async () => {
    mockTtdService.graphqlQuery.mockResolvedValueOnce({
      data: {
        myReportsReportSchedule: {
          status: "ACTIVE",
          filters: {},
          executions: {
            nodes: [{ state: "COMPLETED", delivery: { downloadLink: "https://download" } }],
          },
        },
      },
    });

    const result = await getReportExecutionsLogic(
      { scheduleId: "sched-1" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.mode).toBe("single");
    expect(result.scheduleId).toBe("sched-1");
    expect(result.schedule?.status).toBe("ACTIVE");
  });

  it("getReportExecutionsLogic supports list mode with lastStatusChangeAfter filter", async () => {
    mockTtdService.graphqlQuery.mockResolvedValueOnce({
      data: {
        myReportsReportSchedules: {
          nodes: [{ name: "sched-1" }],
          pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
        },
      },
    });

    const result = await getReportExecutionsLogic(
      { first: 5, after: "cursor-0", lastStatusChangeAfter: "2026-03-01" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.mode).toBe("list");
    expect(result.schedules).toEqual([{ name: "sched-1" }]);
    expect(result.hasNextPage).toBe(true);
    expect(mockTtdService.graphqlQuery).toHaveBeenCalledWith(
      expect.stringContaining("myReportsReportSchedules"),
      {
        where: {
          executions: {
            some: {
              lastStatusChangeDate: { gte: "2026-03-01" },
            },
          },
        },
        first: 5,
        after: "cursor-0",
      },
      expect.any(Object)
    );
  });

  it("getReportExecutionsResponseFormatter shows empty schedule fallback", () => {
    const text = getReportExecutionsResponseFormatter({
      mode: "single",
      scheduleId: "sched-1",
      schedule: {},
      rawResponse: { data: {} },
      timestamp: new Date().toISOString(),
    })[0].text;

    expect(text).toContain("No report schedule found");
  });

  it("cancelReportExecutionLogic returns cancellation status", async () => {
    mockTtdService.graphqlQuery.mockResolvedValueOnce({
      data: {
        myReportsReportExecutionCancel: {
          data: { isCancelled: true },
          errors: [],
        },
      },
    });

    const result = await cancelReportExecutionLogic(
      { executionId: "exec-1" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.isCancelled).toBe(true);
  });

  it("cancelReportExecutionResponseFormatter handles uncancelled executions", () => {
    const text = cancelReportExecutionResponseFormatter({
      executionId: "exec-1",
      isCancelled: false,
      timestamp: new Date().toISOString(),
    })[0].text;

    expect(text).toContain("could not be cancelled");
  });

  it("updateReportScheduleLogic sends reportScheduleId to GraphQL", async () => {
    mockTtdService.graphqlQuery.mockResolvedValueOnce({
      data: {
        myReportsReportScheduleUpdate: {
          data: { status: "DISABLED" },
          errors: [],
        },
      },
    });

    const result = await updateReportScheduleLogic(
      { scheduleId: "sched-1", status: "DISABLED" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.status).toBe("DISABLED");
    expect(mockTtdService.graphqlQuery).toHaveBeenCalledWith(
      expect.stringContaining("myReportsReportScheduleUpdate"),
      { input: { reportScheduleId: "sched-1", status: "DISABLED" } },
      expect.any(Object)
    );
  });

  it("updateReportScheduleResponseFormatter shows success guidance", () => {
    const text = updateReportScheduleResponseFormatter({
      scheduleId: "sched-1",
      status: "ACTIVE",
      timestamp: new Date().toISOString(),
    })[0].text;

    expect(text).toContain("is now `ACTIVE`");
  });

  it("rerunReportScheduleLogic sends the nested single-run input object", async () => {
    mockTtdService.graphqlQuery.mockResolvedValueOnce({
      data: {
        myReportsReportScheduleCreate: {
          data: { id: "sched-1", name: "Rerun", status: "ACTIVE" },
          errors: [],
        },
      },
    });

    const result = await rerunReportScheduleLogic(
      { scheduleId: "sched-1" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.newExecutionData).toEqual({
      id: "sched-1",
      name: "Rerun",
      status: "ACTIVE",
    });
    expect(mockTtdService.graphqlQuery).toHaveBeenCalledWith(
      expect.stringContaining("myReportsReportScheduleCreate"),
      {
        input: {
          singleRunFromExistingScheduleInput: {
            id: "sched-1",
          },
        },
      },
      expect.any(Object)
    );
  });

  it("accepts a single tailAggregations object and normalizes it to an array", async () => {
    mockTtdService.graphqlQuery.mockResolvedValueOnce({
      data: {
        myReportsTemplateScheduleCreate: {
          data: { scheduleId: "sched-1" },
          errors: [],
        },
      },
    });

    const parseResult = CreateTemplateScheduleInputSchema.safeParse({
      templateId: "tpl-1",
      reportName: "Tail Agg Test",
      startDate: "2026-04-02T00:00:00Z",
      frequency: "SINGLE_RUN",
      dateRange: "LAST14_DAYS",
      tailAggregations: {
        columnId: "21",
        tailAggregation: "NO_IMPRESSIONS",
      },
    });

    expect(parseResult.success).toBe(true);

    await createTemplateScheduleLogic(
      parseResult.success ? parseResult.data : ({} as never),
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockTtdService.graphqlQuery).toHaveBeenCalledWith(
      expect.stringContaining("myReportsTemplateScheduleCreate"),
      expect.objectContaining({
        input: expect.objectContaining({
          tailAggregations: [
            {
              columnId: "21",
              tailAggregation: "NO_IMPRESSIONS",
            },
          ],
        }),
      }),
      expect.any(Object)
    );
  });

  it("rejects unsupported date and numeric formatting literals", () => {
    const parseResult = CreateTemplateScheduleInputSchema.safeParse({
      templateId: "tpl-1",
      reportName: "Invalid Formats",
      startDate: "2026-04-02T00:00:00Z",
      frequency: "SINGLE_RUN",
      dateRange: "LAST14_DAYS",
      dateFormat: "ISO_8601",
      numericFormat: "EU",
    });

    expect(parseResult.success).toBe(false);
  });

  it("template tools translate GraphQL entitlement failures into actionable errors", async () => {
    const unauthorizedResponse = {
      errors: [
        {
          message: "Forbidden field",
          extensions: { code: "UNAUTHORIZED_FIELD_OR_TYPE" },
        },
      ],
    };

    mockTtdService.graphqlQuery.mockResolvedValue(unauthorizedResponse);

    await expect(
      listReportTemplatesLogic(
        { first: 10 },
        createMockContext(),
        createMockSdkContext()
      )
    ).rejects.toThrow("does not have access to MyReports template APIs");

    await expect(
      createReportTemplateLogic(
        {
          name: "Template",
          format: "EXCEL",
          resultSets: [
            {
              name: "Tab",
              reportTypeId: "60",
              fields: [],
              metrics: [],
            },
          ],
        },
        createMockContext(),
        createMockSdkContext()
      )
    ).rejects.toThrow("does not have access to MyReports template APIs");

    await expect(
      updateReportTemplateLogic(
        {
          id: "tpl-1",
          name: "Template",
          resultSets: [
            {
              name: "Tab",
              reportTypeId: "60",
              fields: [],
              metrics: [],
            },
          ],
        },
        createMockContext(),
        createMockSdkContext()
      )
    ).rejects.toThrow("does not have access to MyReports template APIs");

    await expect(
      getReportTemplateLogic(
        { id: "tpl-1" },
        createMockContext(),
        createMockSdkContext()
      )
    ).rejects.toThrow("does not have access to MyReports template APIs");

    await expect(
      createTemplateScheduleLogic(
        {
          templateId: "tpl-1",
          reportName: "Schedule",
          startDate: "2026-04-02T00:00:00Z",
          frequency: "SINGLE_RUN",
          dateRange: "LAST14_DAYS",
        },
        createMockContext(),
        createMockSdkContext()
      )
    ).rejects.toThrow("does not have access to MyReports template APIs");
  });
});
