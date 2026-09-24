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
import { getReportLogic } from "../../src/mcp-server/tools/definitions/get-report.tool.js";
import { getReportBreakdownsLogic } from "../../src/mcp-server/tools/definitions/get-report-breakdowns.tool.js";
import { appendSnapchatComputedMetrics } from "../../src/mcp-server/tools/utils/computed-metrics.js";

const mockResolveSession = vi.mocked(resolveSessionServicesFromStore);
const mockGetReport = vi.fn();
const mockGetReportBreakdowns = vi.fn();

// 12.50 spend in micro-currency, 5,000 impressions, 25 swipes, 5 purchases worth 50.00.
const HEADERS = [
  "campaign_id",
  "spend",
  "impressions",
  "swipes",
  "conversion_purchases",
  "conversion_purchases_value",
];
const ROW = ["c1", "12500000", "5000", "25", "5", "50000000"];

beforeEach(() => {
  mockGetReport.mockReset();
  mockGetReportBreakdowns.mockReset();
  mockResolveSession.mockReturnValue({
    snapchatReportingService: {
      getReport: mockGetReport,
      getReportBreakdowns: mockGetReportBreakdowns,
    },
    boundAdAccountId: "acct_1",
  } as any);
});

describe("Snapchat computed report metrics (spend is micro-currency)", () => {
  it("converts spend and purchase value from micros before computing", () => {
    const { headers, rows } = appendSnapchatComputedMetrics(HEADERS, [ROW]);
    const rec = Object.fromEntries(headers.map((h, i) => [h, rows[0][i]]));

    // cost = 12.50 → CPA 2.5, CPM 2.5, CPC 0.5, ROAS 50/12.5 = 4.
    expect(rec.computed_cpa).toBe("2.5");
    expect(rec.computed_cpm).toBe("2.5");
    expect(rec.computed_cpc).toBe("0.5");
    expect(rec.computed_roas).toBe("4");
    expect(rec.computed_ctr).toBe("0.5");
    // Raw columns are untouched.
    expect(rec.spend).toBe("12500000");
  });

  it("leaves ROAS blank when there is no purchase-value column instead of reporting 0", () => {
    const { headers, rows } = appendSnapchatComputedMetrics(
      ["spend", "impressions"],
      [["1000000", "100"]]
    );
    expect(rows[0][headers.indexOf("computed_roas")]).toBe("");
    expect(rows[0][headers.indexOf("computed_cpm")]).toBe("10");
  });

  it("snapchat_get_report computes CPM in account currency, not micros", async () => {
    mockGetReport.mockResolvedValueOnce({
      headers: HEADERS,
      rows: [ROW],
      totalRows: 1,
      taskId: "t1",
    });

    const result = await getReportLogic(
      {
        adAccountId: "acct_1",
        fields: ["spend", "impressions"],
        startTime: "2026-03-01T00:00:00Z",
        endTime: "2026-03-02T00:00:00Z",
        granularity: "DAY",
        includeComputedMetrics: true,
        mode: "rows",
      } as any,
      { requestId: "r" } as any,
      { sessionId: "s" } as any
    );

    const row = (result as any).rows[0];
    expect(row.computed_cpm).toBe("2.5");
    expect(row.computed_cpa).toBe("2.5");
  });

  it("snapchat_get_report_breakdowns computes CPC in account currency, not micros", async () => {
    mockGetReportBreakdowns.mockResolvedValueOnce({
      headers: HEADERS,
      rows: [ROW],
      totalRows: 1,
      taskId: "t2",
    });

    const result = await getReportBreakdownsLogic(
      {
        adAccountId: "acct_1",
        fields: ["spend", "swipes"],
        breakdowns: ["gender"],
        datePreset: "LAST_7_DAYS",
        granularity: "DAY",
        includeComputedMetrics: true,
        mode: "rows",
      } as any,
      { requestId: "r" } as any,
      { sessionId: "s" } as any
    );

    const row = (result as any).rows[0];
    expect(row.computed_cpc).toBe("0.5");
  });
});
