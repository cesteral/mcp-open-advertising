import { describe, expect, it } from "vitest";
import {
  arrayRowsToRecords,
  createReportView,
  REPORT_MAX_RETURNED_ROWS,
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
