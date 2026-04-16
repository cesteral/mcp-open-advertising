import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  RunCustomQueryInputSchema,
  runCustomQueryLogic,
  type RunCustomQueryInput,
} from "../../src/mcp-server/tools/definitions/run-custom-query.tool.js";

function createMockContext() {
  return {
    requestId: "req-1",
    timestamp: new Date().toISOString(),
    operation: "test",
  } as any;
}

function makeStructuredRows(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => ({
    Date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
    Impressions: 1000 + i,
    Clicks: 50 + i,
  }));
}

function createMockBidManagerService(rowCount: number, dataMode: "structured" | "csv" = "structured") {
  const data: Record<string, unknown>[] | string =
    dataMode === "csv" ? "Date,Impressions,Clicks\n2026-01-01,1000,50\n" : makeStructuredRows(rowCount);

  return {
    executeCustomQuery: vi.fn().mockImplementation(async (req: any) => ({
      queryId: "q-1",
      reportId: "r-1",
      status: "DONE",
      rowCount,
      columns: ["Date", "Impressions", "Clicks"],
      data,
      __req: req,
    })),
  };
}

const baseInput: RunCustomQueryInput = {
  reportType: "STANDARD",
  groupBys: ["FILTER_DATE", "FILTER_LINE_ITEM"],
  metrics: ["METRIC_IMPRESSIONS", "METRIC_CLICKS"],
  dateRange: { preset: "LAST_7_DAYS" },
  strictValidation: false,
  outputFormat: "structured",
} as any;

describe("RunCustomQueryInputSchema", () => {
  it("accepts a preset date range", () => {
    const result = RunCustomQueryInputSchema.safeParse({
      reportType: "STANDARD",
      groupBys: ["FILTER_DATE"],
      metrics: ["METRIC_IMPRESSIONS"],
      dateRange: { preset: "LAST_7_DAYS" },
      strictValidation: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an explicit date range", () => {
    const result = RunCustomQueryInputSchema.safeParse({
      reportType: "STANDARD",
      groupBys: ["FILTER_DATE"],
      metrics: ["METRIC_IMPRESSIONS"],
      dateRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
      strictValidation: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty groupBys", () => {
    const result = RunCustomQueryInputSchema.safeParse({
      reportType: "STANDARD",
      groupBys: [],
      metrics: ["METRIC_IMPRESSIONS"],
      dateRange: { preset: "LAST_7_DAYS" },
      strictValidation: false,
    });
    expect(result.success).toBe(false);
  });

  it("accepts bounded view params", () => {
    const result = RunCustomQueryInputSchema.safeParse({
      reportType: "STANDARD",
      groupBys: ["FILTER_DATE"],
      metrics: ["METRIC_IMPRESSIONS"],
      dateRange: { preset: "LAST_7_DAYS" },
      strictValidation: false,
      mode: "rows",
      maxRows: 50,
      offset: 0,
      columns: ["Date", "Impressions"],
    });
    expect(result.success).toBe(true);
  });
});

describe("runCustomQueryLogic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a summary preview by default and forwards query params", async () => {
    const service = createMockBidManagerService(120);
    mockResolveSessionServices.mockReturnValue({ bidManagerService: service });

    const result = await runCustomQueryLogic(baseInput, createMockContext(), { sessionId: "s-1" } as any);

    expect(result.queryId).toBe("q-1");
    expect(result.reportId).toBe("r-1");
    expect(result.rowCount).toBe(120);
    expect(result.mode).toBe("summary");
    expect(result.previewRows).toHaveLength(10);
    expect(result.totalRows).toBe(120);
    expect(service.executeCustomQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        reportType: "STANDARD",
        groupBys: ["FILTER_DATE", "FILTER_LINE_ITEM"],
        metrics: ["METRIC_IMPRESSIONS", "METRIC_CLICKS"],
        dateRange: { preset: "LAST_7_DAYS" },
      })
    );
  });

  it("returns up to 50 rows in rows mode by default", async () => {
    const service = createMockBidManagerService(120);
    mockResolveSessionServices.mockReturnValue({ bidManagerService: service });

    const result = await runCustomQueryLogic(
      { ...baseInput, mode: "rows" } as RunCustomQueryInput,
      createMockContext(),
      { sessionId: "s-1" } as any
    );

    expect(result.mode).toBe("rows");
    expect(result.rows).toHaveLength(50);
  });

  it("caps maxRows at 200 and warns when exceeded", async () => {
    const service = createMockBidManagerService(500);
    mockResolveSessionServices.mockReturnValue({ bidManagerService: service });

    const result = await runCustomQueryLogic(
      { ...baseInput, mode: "rows", maxRows: 1000 } as RunCustomQueryInput,
      createMockContext(),
      { sessionId: "s-1" } as any
    );

    expect(result.returnedRows).toBe(200);
    expect(result.warnings.some((w) => w.includes("200"))).toBe(true);
  });

  it("warns when csv outputFormat is requested but returns a structured bounded view", async () => {
    const service = createMockBidManagerService(5, "csv");
    mockResolveSessionServices.mockReturnValue({ bidManagerService: service });

    const result = await runCustomQueryLogic(
      { ...baseInput, outputFormat: "csv" } as RunCustomQueryInput,
      createMockContext(),
      { sessionId: "s-1" } as any
    );

    expect(result.warnings.some((w) => w.includes("csv"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("CSV result was not embedded"))).toBe(true);
    expect(result.previewRows).toEqual([]);
  });
});
