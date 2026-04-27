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
    createReportSchedule: vi.fn(),
    listReportSchedules: vi.fn(),
    deleteReportSchedule: vi.fn(),
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
  createReportScheduleLogic,
  CreateReportScheduleInputSchema,
} from "../../src/mcp-server/tools/definitions/create-report-schedule.tool.js";

const mockContext = { requestId: "test-req" } as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CreateReportScheduleInputSchema", () => {
  it("accepts weekly schedules with repeatsOnWeekDays", () => {
    const result = CreateReportScheduleInputSchema.safeParse({
      profileId: "123",
      name: "Weekly report",
      type: "STANDARD",
      schedule: {
        active: true,
        every: 1,
        repeats: "WEEKLY",
        repeatsOnWeekDays: ["MONDAY"],
        startDate: "2026-04-01",
      },
      criteria: {
        dateRange: { relativeDateRange: "LAST_7_DAYS" },
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts monthly schedules with runsOnDayOfMonth", () => {
    const result = CreateReportScheduleInputSchema.safeParse({
      profileId: "123",
      name: "Monthly report",
      type: "FLOODLIGHT",
      schedule: {
        active: true,
        every: 1,
        repeats: "MONTHLY",
        runsOnDayOfMonth: "DAY_OF_MONTH",
        startDate: "2026-04-01",
      },
      floodlightCriteria: {
        dateRange: { relativeDateRange: "LAST_MONTH" },
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects legacy runsOnDayOfWeek field", () => {
    const result = CreateReportScheduleInputSchema.safeParse({
      profileId: "123",
      name: "Weekly report",
      type: "STANDARD",
      schedule: {
        active: true,
        every: 1,
        repeats: "WEEKLY",
        runsOnDayOfWeek: "MONDAY",
        startDate: "2026-04-01",
      },
      criteria: {
        dateRange: { relativeDateRange: "LAST_7_DAYS" },
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects schedules without a non-TODAY relative date range", () => {
    const result = CreateReportScheduleInputSchema.safeParse({
      profileId: "123",
      name: "Bad schedule",
      type: "STANDARD",
      schedule: {
        active: true,
        every: 1,
        repeats: "DAILY",
        startDate: "2026-04-01",
      },
      criteria: {
        dateRange: { startDate: "2026-04-01", endDate: "2026-04-30" },
      },
    });

    expect(result.success).toBe(false);
  });
});

describe("createReportScheduleLogic", () => {
  it("sends the typed criteria field and schedule payload", async () => {
    mockState.cm360ReportingService.createReportSchedule.mockResolvedValue({
      reportId: "report-1",
      reportName: "Weekly report",
      schedule: { repeats: "WEEKLY" },
    });

    await createReportScheduleLogic(
      {
        profileId: "123",
        name: "Weekly report",
        type: "REACH",
        schedule: {
          active: true,
          every: 1,
          repeats: "WEEKLY",
          repeatsOnWeekDays: ["MONDAY"],
          startDate: "2026-04-01",
        },
        reachCriteria: {
          dateRange: { relativeDateRange: "LAST_7_DAYS" },
          dimensions: [{ name: "campaign" }],
        },
      },
      mockContext
    );

    expect(mockState.cm360ReportingService.createReportSchedule).toHaveBeenCalledWith(
      "123",
      {
        name: "Weekly report",
        type: "REACH",
        reachCriteria: {
          dateRange: { relativeDateRange: "LAST_7_DAYS" },
          dimensions: [{ name: "campaign" }],
        },
        schedule: {
          active: true,
          every: 1,
          repeats: "WEEKLY",
          repeatsOnWeekDays: ["MONDAY"],
          startDate: "2026-04-01",
        },
      },
      mockContext
    );
  });
});
