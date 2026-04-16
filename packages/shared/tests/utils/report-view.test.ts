import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  arrayRowsToRecords,
  createReportView,
  getBoundedReportViewOutputMissingKeys,
  getReportViewFetchLimit,
  isBoundedReportViewInputSchema,
  REPORT_AGGREGATE_MAX_FETCH_ROWS,
  REPORT_MAX_RETURNED_ROWS,
  ReportViewInputSchema,
  ReportViewOutputSchema,
} from "../../src/utils/report-view.js";

describe("report view utilities", () => {
  it("defaults to summary mode with preview rows", () => {
    const result = createReportView({
      headers: ["Campaign", "Impressions"],
      rows: [
        { Campaign: "A", Impressions: "10" },
        { Campaign: "B", Impressions: "20" },
      ],
    });

    expect(result.mode).toBe("summary");
    expect(result.previewRows).toEqual([
      { Campaign: "A", Impressions: "10" },
      { Campaign: "B", Impressions: "20" },
    ]);
    expect(result.rows).toBeUndefined();
    expect(result.nextOffset).toBeNull();
  });

  it("returns paged rows in rows mode", () => {
    const result = createReportView({
      headers: ["Campaign", "Impressions"],
      rows: [
        { Campaign: "A", Impressions: "10" },
        { Campaign: "B", Impressions: "20" },
        { Campaign: "C", Impressions: "30" },
      ],
      input: { mode: "rows", offset: 1, maxRows: 1 },
    });

    expect(result.rows).toEqual([{ Campaign: "B", Impressions: "20" }]);
    expect(result.previewRows).toBeUndefined();
    expect(result.truncated).toBe(true);
    expect(result.nextOffset).toBe(2);
  });

  it("caps maxRows and warns", () => {
    const rows = Array.from({ length: REPORT_MAX_RETURNED_ROWS + 1 }, (_, i) => ({ id: String(i) }));
    const result = createReportView({
      headers: ["id"],
      rows,
      input: { mode: "rows", maxRows: 10000 },
    });

    expect(result.rows).toHaveLength(REPORT_MAX_RETURNED_ROWS);
    expect(result.warnings).toContain(`maxRows capped at ${REPORT_MAX_RETURNED_ROWS} to keep the MCP response bounded.`);
  });

  it("projects columns and warns on unknown columns", () => {
    const result = createReportView({
      headers: ["Campaign", "Impressions", "Spend"],
      rows: [{ Campaign: "A", Impressions: "10", Spend: "2.50" }],
      input: { columns: ["Campaign", "Missing"] },
    });

    expect(result.selectedColumns).toEqual(["Campaign"]);
    expect(result.previewRows).toEqual([{ Campaign: "A" }]);
    expect(result.warnings).toContain("Unknown columns ignored: Missing");
  });

  it("converts array rows to records", () => {
    expect(arrayRowsToRecords(["A", "B"], [["1", "2"], ["3"]])).toEqual([
      { A: "1", B: "2" },
      { A: "3", B: "" },
    ]);
  });

  it("uses totalRows override when rows contain a fetched prefix", () => {
    const result = createReportView({
      headers: ["id"],
      rows: [{ id: "0" }, { id: "1" }, { id: "2" }],
      totalRows: 10,
      input: { mode: "rows", offset: 2, maxRows: 1 },
    });

    expect(result.rows).toEqual([{ id: "2" }]);
    expect(result.totalRows).toBe(10);
    expect(result.nextOffset).toBe(3);
    expect(result.truncated).toBe(true);
  });
});

describe("aggregateBy server-side aggregation", () => {
  const baseRows = [
    { campaign: "A", country: "US", impressions: "100", clicks: "10" },
    { campaign: "A", country: "GB", impressions: "200", clicks: "20" },
    { campaign: "A", country: "US", impressions: "50", clicks: "5" },
    { campaign: "B", country: "US", impressions: "300", clicks: "30" },
  ];

  it("groups by a single column with default sum aggregation", () => {
    const result = createReportView({
      headers: ["campaign", "country", "impressions", "clicks"],
      rows: baseRows,
      input: { mode: "rows", aggregateBy: ["campaign"], maxRows: 10 },
    });

    expect(result.totalRows).toBe(2);
    expect(result.headers).toEqual(["campaign", "country", "impressions", "clicks"]);
    expect(result.rows).toEqual([
      { campaign: "A", country: 0, impressions: 350, clicks: 35 },
      { campaign: "B", country: 0, impressions: 300, clicks: 30 },
    ]);
  });

  it("groups by multiple columns", () => {
    const result = createReportView({
      headers: ["campaign", "country", "impressions", "clicks"],
      rows: baseRows,
      input: { mode: "rows", aggregateBy: ["campaign", "country"], maxRows: 10 },
    });

    expect(result.totalRows).toBe(3);
    const sorted = [...(result.rows ?? [])].sort((a, b) =>
      `${a.campaign}|${a.country}`.localeCompare(`${b.campaign}|${b.country}`)
    );
    expect(sorted).toEqual([
      { campaign: "A", country: "GB", impressions: 200, clicks: 20 },
      { campaign: "A", country: "US", impressions: 150, clicks: 15 },
      { campaign: "B", country: "US", impressions: 300, clicks: 30 },
    ]);
  });

  it("supports sum/avg/count/min/max via aggregateMetrics", () => {
    const result = createReportView({
      headers: ["campaign", "impressions", "cpm", "clicks"],
      rows: [
        { campaign: "A", impressions: "100", cpm: "5.0", clicks: "10" },
        { campaign: "A", impressions: "200", cpm: "7.0", clicks: "20" },
        { campaign: "A", impressions: "300", cpm: "9.0", clicks: "30" },
      ],
      input: {
        mode: "rows",
        aggregateBy: ["campaign"],
        aggregateMetrics: { impressions: "sum", cpm: "avg", clicks: "count" },
        maxRows: 10,
      },
    });

    expect(result.rows).toEqual([
      { campaign: "A", impressions: 600, cpm: 7, clicks: 3 },
    ]);
  });

  it("supports min and max", () => {
    const result = createReportView({
      headers: ["campaign", "cpm"],
      rows: [
        { campaign: "A", cpm: "3" },
        { campaign: "A", cpm: "1" },
        { campaign: "A", cpm: "5" },
      ],
      input: {
        mode: "rows",
        aggregateBy: ["campaign"],
        aggregateMetrics: { cpm: "min" },
        maxRows: 10,
      },
    });
    expect(result.rows).toEqual([{ campaign: "A", cpm: 1 }]);

    const maxResult = createReportView({
      headers: ["campaign", "cpm"],
      rows: [
        { campaign: "A", cpm: "3" },
        { campaign: "A", cpm: "1" },
        { campaign: "A", cpm: "5" },
      ],
      input: {
        mode: "rows",
        aggregateBy: ["campaign"],
        aggregateMetrics: { cpm: "max" },
        maxRows: 10,
      },
    });
    expect(maxResult.rows).toEqual([{ campaign: "A", cpm: 5 }]);
  });

  it("warns on unknown aggregateBy columns and skips when none match", () => {
    const result = createReportView({
      headers: ["campaign", "impressions"],
      rows: [{ campaign: "A", impressions: "100" }],
      input: { mode: "rows", aggregateBy: ["unknown_col"], maxRows: 10 },
    });

    expect(result.warnings).toContain("Unknown aggregateBy column ignored: unknown_col");
    expect(result.warnings).toContain("aggregateBy did not match any known columns; aggregation skipped.");
    expect(result.rows).toEqual([{ campaign: "A", impressions: "100" }]);
  });

  it("warns on unknown aggregateMetrics columns", () => {
    const result = createReportView({
      headers: ["campaign", "impressions"],
      rows: [{ campaign: "A", impressions: "100" }],
      input: {
        mode: "rows",
        aggregateBy: ["campaign"],
        aggregateMetrics: { unknown_metric: "sum" },
        maxRows: 10,
      },
    });
    expect(result.warnings).toContain("Unknown aggregateMetrics column ignored: unknown_metric");
  });

  it("warns when a metric column has non-numeric values and excludes them", () => {
    const result = createReportView({
      headers: ["campaign", "impressions"],
      rows: [
        { campaign: "A", impressions: "100" },
        { campaign: "A", impressions: "not-a-number" },
        { campaign: "A", impressions: "50" },
      ],
      input: { mode: "rows", aggregateBy: ["campaign"], maxRows: 10 },
    });
    expect(result.rows).toEqual([{ campaign: "A", impressions: 150 }]);
    expect(
      result.warnings.some((w) => w.includes("non-numeric") && w.includes("impressions"))
    ).toBe(true);
  });

  it("paginates after aggregation (offset and maxRows operate on grouped rows)", () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      campaign: `C${i}`,
      impressions: String(i * 10),
    }));
    const result = createReportView({
      headers: ["campaign", "impressions"],
      rows,
      input: { mode: "rows", aggregateBy: ["campaign"], offset: 10, maxRows: 5 },
    });

    expect(result.totalRows).toBe(25);
    expect(result.returnedRows).toBe(5);
    expect(result.nextOffset).toBe(15);
    expect((result.rows ?? [])[0]?.campaign).toBe("C10");
  });

  it("fetch limit jumps to the aggregate cap when aggregateBy is set", () => {
    expect(getReportViewFetchLimit({ mode: "summary" })).toBe(10);
    expect(getReportViewFetchLimit({ mode: "rows", maxRows: 50 })).toBe(50);
    expect(getReportViewFetchLimit({ mode: "rows", offset: 100, maxRows: 50 })).toBe(150);
    expect(
      getReportViewFetchLimit({
        mode: "summary",
        aggregateBy: ["campaign"],
      })
    ).toBe(REPORT_AGGREGATE_MAX_FETCH_ROWS);
  });

  it("warns when aggregation only saw a partial upstream slice", () => {
    const result = createReportView({
      headers: ["campaign", "impressions"],
      rows: baseRows,
      // Pretend the upstream report had 1M rows but the caller only fetched 4.
      totalRows: 1_000_000,
      input: { mode: "rows", aggregateBy: ["campaign"], maxRows: 10 },
    });

    expect(
      result.warnings.some(
        (w) => w.includes("partial") && w.includes("1000000") && w.includes("4")
      )
    ).toBe(true);
    // Aggregation still runs over what we got.
    expect(result.totalRows).toBe(2);
  });

  it("does not warn when the caller fetched the full upstream report", () => {
    const result = createReportView({
      headers: ["campaign", "impressions"],
      rows: baseRows,
      totalRows: baseRows.length,
      input: { mode: "rows", aggregateBy: ["campaign"], maxRows: 10 },
    });

    expect(result.warnings.some((w) => w.includes("partial"))).toBe(false);
  });

  it("applies columns projection after aggregation", () => {
    const result = createReportView({
      headers: ["campaign", "country", "impressions", "clicks"],
      rows: baseRows,
      input: {
        mode: "rows",
        aggregateBy: ["campaign"],
        columns: ["campaign", "impressions"],
        maxRows: 10,
      },
    });
    expect(result.selectedColumns).toEqual(["campaign", "impressions"]);
    expect(result.rows).toEqual([
      { campaign: "A", impressions: 350 },
      { campaign: "B", impressions: 300 },
    ]);
  });
});

describe("schema introspection helpers", () => {
  it("detects schemas merged with ReportViewInputSchema", () => {
    const schema = z.object({ downloadUrl: z.string() }).merge(ReportViewInputSchema);
    expect(isBoundedReportViewInputSchema(schema)).toBe(true);
  });

  it("detects schemas with ReportViewInputSchema and refine wrapper", () => {
    const schema = z
      .object({ accountId: z.string() })
      .merge(ReportViewInputSchema)
      .refine(() => true);
    expect(isBoundedReportViewInputSchema(schema)).toBe(true);
  });

  it("returns false for plain object schemas", () => {
    const schema = z.object({ id: z.string() });
    expect(isBoundedReportViewInputSchema(schema)).toBe(false);
  });

  it("returns false for non-object schemas", () => {
    expect(isBoundedReportViewInputSchema(z.string())).toBe(false);
    expect(isBoundedReportViewInputSchema(undefined)).toBe(false);
  });

  it("reports no missing keys for schemas extending ReportViewOutputSchema", () => {
    const schema = z.object({
      ...ReportViewOutputSchema.shape,
      timestamp: z.string(),
    });
    expect(getBoundedReportViewOutputMissingKeys(schema)).toEqual([]);
  });

  it("reports missing keys when output shape lacks bounded-view fields", () => {
    const schema = z.object({ id: z.string() });
    const missing = getBoundedReportViewOutputMissingKeys(schema);
    expect(missing).toContain("mode");
    expect(missing).toContain("returnedRows");
    expect(missing).toContain("warnings");
  });
});
