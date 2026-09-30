import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/services/session-services.js", () => ({
  sessionServiceStore: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getAuthContext: vi.fn(),
  },
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, resolveSessionServicesFromStore: vi.fn() };
});

import { resolveSessionServicesFromStore } from "@cesteral/shared";
const mockResolveSession = vi.mocked(resolveSessionServicesFromStore);

import {
  GetReportBreakdownsInputSchema,
  getReportBreakdownsLogic,
} from "../../src/mcp-server/tools/definitions/get-report-breakdowns.tool.js";
import { REPORT_DIMENSIONS } from "../../src/services/snapchat/report-dimensions.js";

const mockGetReportBreakdowns = vi.fn();
const mockResolveDatePresetRange = vi.fn();

const ctx = { requestId: "req" } as any;
const sdk = { sessionId: "sess" } as any;

const base = {
  adAccountId: "1234567890",
  fields: ["impressions", "spend"],
  reportDimension: "age,gender",
  startTime: "2026-03-01T00:00:00-08:00",
  endTime: "2026-03-05T00:00:00-08:00",
  granularity: "TOTAL",
} as const;

beforeEach(() => {
  mockGetReportBreakdowns.mockReset().mockResolvedValue({
    headers: ["age_bucket", "gender", "impressions", "spend"],
    rows: [["18-20", "female", "100", "2500000"]],
    totalRows: 1,
    taskId: "rpt-1",
  });
  mockResolveDatePresetRange.mockReset().mockResolvedValue({
    start_time: "2026-03-01T00:00:00-08:00",
    end_time: "2026-03-08T00:00:00-08:00",
  });
  mockResolveSession.mockReturnValue({
    snapchatReportingService: {
      getReportBreakdowns: mockGetReportBreakdowns,
      resolveDatePresetRange: mockResolveDatePresetRange,
    },
    boundAdAccountId: "1234567890",
  } as any);
});

describe("snapchat_get_report_breakdowns (#233)", () => {
  it("sends the dimension as report_dimension and leaves the metric fields alone", async () => {
    const input = GetReportBreakdownsInputSchema.parse(base);
    const result = await getReportBreakdownsLogic(input, ctx, sdk);

    expect(mockGetReportBreakdowns).toHaveBeenCalledOnce();
    const [config, dimension] = mockGetReportBreakdowns.mock.calls[0]!;
    expect(dimension).toBe("age,gender");
    expect(config.fields).toEqual(["impressions", "spend"]);
    expect(result.appliedFields).toEqual(["impressions", "spend"]);
    expect(result.reportDimension).toBe("age,gender");
  });

  it("resolves a date preset through the account's timezone, not UTC", async () => {
    const { startTime: _s, endTime: _e, ...rest } = base;
    const input = GetReportBreakdownsInputSchema.parse({ ...rest, datePreset: "LAST_7_DAYS" });
    await getReportBreakdownsLogic(input, ctx, sdk);

    expect(mockResolveDatePresetRange).toHaveBeenCalledWith("LAST_7_DAYS", ctx);
    const [config] = mockGetReportBreakdowns.mock.calls[0]!;
    expect(config.start_time).toBe("2026-03-01T00:00:00-08:00");
    expect(config.end_time).toBe("2026-03-08T00:00:00-08:00");
  });

  it("accepts every documented report_dimension value", () => {
    for (const reportDimension of REPORT_DIMENSIONS) {
      expect(GetReportBreakdownsInputSchema.safeParse({ ...base, reportDimension }).success).toBe(
        true
      );
    }
  });

  it("rejects names that were never report_dimension values", () => {
    // These were the tool's old examples; Snap has no such dimensions.
    for (const reportDimension of ["country_code", "platform", "placement", "interest_category"]) {
      expect(GetReportBreakdownsInputSchema.safeParse({ ...base, reportDimension }).success).toBe(
        false
      );
    }
  });

  it("rejects HOUR granularity, which Snap does not allow with a dimension", () => {
    const parsed = GetReportBreakdownsInputSchema.safeParse({ ...base, granularity: "HOUR" });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toMatch(/HOUR/);
  });
});
