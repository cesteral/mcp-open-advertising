// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";

export const REPORT_SUMMARY_DEFAULT_ROWS = 10;
export const REPORT_ROWS_DEFAULT_ROWS = 50;
export const REPORT_MAX_RETURNED_ROWS = 200;

/**
 * When `aggregateBy` is set, the bounded view must aggregate over the full
 * upstream report (not the small page that would otherwise be requested).
 * `getReportViewFetchLimit` returns this value so callers fetch a wide window.
 * Reports larger than this still aggregate, but a warning is emitted because
 * grouped totals will only reflect the first `REPORT_AGGREGATE_MAX_FETCH_ROWS`
 * upstream rows.
 */
export const REPORT_AGGREGATE_MAX_FETCH_ROWS = 100_000;

export const ReportViewModeSchema = z.enum(["summary", "rows"]);

export const ReportViewAggregationFnSchema = z.enum(["sum", "avg", "count", "min", "max"]);
export type ReportViewAggregationFn = z.infer<typeof ReportViewAggregationFnSchema>;

export const ReportViewInputSchema = z.object({
  mode: ReportViewModeSchema.optional()
    .default("summary")
    .describe(
      "Return mode. summary returns counts, columns, and previewRows. rows returns a bounded page of rows. Default: summary"
    ),
  columns: z
    .array(z.string().min(1))
    .optional()
    .describe("Optional list of columns to include in returned row payloads"),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Zero-based row offset for previewRows or rows pagination (default: 0)"),
  maxRows: z
    .number()
    .int()
    .min(1)
    .max(10000)
    .optional()
    .describe(
      "Maximum rows to return before the server cap is applied (default: 10 for summary, 50 for rows; hard cap: 200)"
    ),
  aggregateBy: z
    .array(z.string().min(1))
    .optional()
    .describe(
      "Group rows by these column values before pagination. Non-grouping columns are aggregated per group. totalRows reflects the post-aggregation row count."
    ),
  aggregateMetrics: z
    .record(ReportViewAggregationFnSchema)
    .optional()
    .describe(
      "Aggregation function per non-grouping column (sum/avg/count/min/max). Columns not listed default to sum. Non-numeric values are treated as 0 with a warning."
    ),
});

export const ReportViewOutputSchema = z.object({
  totalRows: z.number().describe("Total rows in the report"),
  returnedRows: z.number().describe("Number of rows returned in this response"),
  truncated: z.boolean().describe("Whether more rows are available"),
  nextOffset: z
    .number()
    .nullable()
    .describe("Next offset to request, or null when there are no more rows"),
  headers: z.array(z.string()).describe("Full column/header list"),
  selectedColumns: z.array(z.string()).describe("Columns included in returned row payloads"),
  mode: ReportViewModeSchema.describe("Return mode used for this response"),
  previewRows: z
    .array(z.record(z.any()))
    .optional()
    .describe("Small parsed row preview for summary mode"),
  rows: z.array(z.record(z.any())).optional().describe("Parsed data rows for rows mode"),
  warnings: z
    .array(z.string())
    .describe("Non-fatal warnings about projection, caps, or pagination"),
});

export type ReportViewInput = z.infer<typeof ReportViewInputSchema>;
export type ReportViewOutput = z.infer<typeof ReportViewOutputSchema>;
export type ReportViewRow = Record<string, unknown>;

export function getReportViewPageSize(input?: ReportViewInput): number {
  const mode = input?.mode ?? "summary";
  const requestedMaxRows =
    input?.maxRows ?? (mode === "summary" ? REPORT_SUMMARY_DEFAULT_ROWS : REPORT_ROWS_DEFAULT_ROWS);
  return Math.min(requestedMaxRows, REPORT_MAX_RETURNED_ROWS);
}

export function getReportViewFetchLimit(input?: ReportViewInput): number {
  if (input?.aggregateBy && input.aggregateBy.length > 0) {
    return REPORT_AGGREGATE_MAX_FETCH_ROWS;
  }
  return (input?.offset ?? 0) + getReportViewPageSize(input);
}

export function arrayRowsToRecords(headers: string[], rows: string[][]): ReportViewRow[] {
  return rows.map((row) => {
    const record: ReportViewRow = {};
    for (let i = 0; i < headers.length; i++) {
      record[headers[i] ?? String(i)] = row[i] ?? "";
    }
    return record;
  });
}

export function inferHeadersFromRows(rows: ReportViewRow[]): string[] {
  const seen = new Set<string>();
  const headers: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  return headers;
}

export function createReportView(params: {
  headers?: string[];
  rows: ReportViewRow[];
  totalRows?: number;
  input?: ReportViewInput;
  warnings?: string[];
}): ReportViewOutput {
  const mode = params.input?.mode ?? "summary";
  const requestedMaxRows =
    params.input?.maxRows ??
    (mode === "summary" ? REPORT_SUMMARY_DEFAULT_ROWS : REPORT_ROWS_DEFAULT_ROWS);
  const maxRows = getReportViewPageSize(params.input);
  const offset = params.input?.offset ?? 0;
  const warnings = [...(params.warnings ?? [])];
  const inputHeaders =
    params.headers && params.headers.length > 0
      ? params.headers
      : inferHeadersFromRows(params.rows);

  let workingRows = params.rows;
  let headers = inputHeaders;
  let totalRows = params.totalRows ?? params.rows.length;

  if (params.input?.aggregateBy && params.input.aggregateBy.length > 0) {
    if (params.totalRows !== undefined && params.totalRows > params.rows.length) {
      warnings.push(
        `Aggregated ${params.rows.length} of ${params.totalRows} upstream rows; grouped totals are partial. ` +
          `Reduce the date range, pre-filter, or raise the fetch cap (${REPORT_AGGREGATE_MAX_FETCH_ROWS}) to include all rows.`
      );
    }
    const aggregated = aggregateRows(
      params.rows,
      inputHeaders,
      params.input.aggregateBy,
      params.input.aggregateMetrics,
      warnings
    );
    workingRows = aggregated.rows;
    headers = aggregated.headers;
    totalRows = aggregated.rows.length;
  }

  if (requestedMaxRows > REPORT_MAX_RETURNED_ROWS) {
    warnings.push(
      `maxRows capped at ${REPORT_MAX_RETURNED_ROWS} to keep the MCP response bounded.`
    );
  }

  if (offset > totalRows) {
    warnings.push(
      `offset ${offset} is beyond the report row count ${totalRows}; returned no rows.`
    );
  }

  const selectedColumns = resolveSelectedColumns(headers, params.input?.columns, warnings);
  const pageRows = workingRows
    .slice(offset, offset + maxRows)
    .map((row) => projectRow(row, selectedColumns));
  const nextOffset = offset + pageRows.length < totalRows ? offset + pageRows.length : null;
  const truncated = nextOffset !== null;

  if (truncated) {
    warnings.push(`More rows are available. Call again with offset ${nextOffset}.`);
  }

  return {
    totalRows,
    returnedRows: pageRows.length,
    truncated,
    nextOffset,
    headers,
    selectedColumns,
    mode,
    ...(mode === "summary" ? { previewRows: pageRows } : { rows: pageRows }),
    warnings,
  };
}

function aggregateRows(
  rows: ReportViewRow[],
  headers: string[],
  aggregateBy: string[],
  aggregateMetrics: Record<string, ReportViewAggregationFn> | undefined,
  warnings: string[]
): { rows: ReportViewRow[]; headers: string[] } {
  const headerSet = new Set(headers);
  const validGroupBy: string[] = [];
  const seenGroupBy = new Set<string>();
  for (const col of aggregateBy) {
    if (!headerSet.has(col)) {
      warnings.push(`Unknown aggregateBy column ignored: ${col}`);
      continue;
    }
    if (seenGroupBy.has(col)) continue;
    seenGroupBy.add(col);
    validGroupBy.push(col);
  }

  if (validGroupBy.length === 0) {
    warnings.push("aggregateBy did not match any known columns; aggregation skipped.");
    return { rows, headers };
  }

  const metricColumns = headers.filter((h) => !seenGroupBy.has(h));
  const explicit = aggregateMetrics ?? {};

  for (const col of Object.keys(explicit)) {
    if (!headerSet.has(col) || seenGroupBy.has(col)) {
      warnings.push(`Unknown aggregateMetrics column ignored: ${col}`);
    }
  }

  const fnByMetric: Record<string, ReportViewAggregationFn> = {};
  for (const col of metricColumns) {
    fnByMetric[col] = explicit[col] ?? "sum";
  }

  const groups = new Map<string, { key: ReportViewRow; rows: ReportViewRow[] }>();
  for (const row of rows) {
    const keyParts = validGroupBy.map((c) => stringifyKeyPart(row[c]));
    const keyStr = keyParts.join("\u0000");
    let bucket = groups.get(keyStr);
    if (!bucket) {
      const key: ReportViewRow = {};
      for (const c of validGroupBy) key[c] = row[c] ?? "";
      bucket = { key, rows: [] };
      groups.set(keyStr, bucket);
    }
    bucket.rows.push(row);
  }

  const nonNumericColumns = new Set<string>();
  const aggregated: ReportViewRow[] = [];
  for (const { key, rows: groupRows } of groups.values()) {
    const out: ReportViewRow = { ...key };
    for (const col of metricColumns) {
      const fn = fnByMetric[col];
      if (!fn) continue;
      if (fn === "count") {
        out[col] = groupRows.length;
        continue;
      }
      const values: number[] = [];
      let nonNumericInGroup = false;
      for (const row of groupRows) {
        const raw = row[col];
        if (raw === undefined || raw === null || raw === "") {
          nonNumericInGroup = true;
          continue;
        }
        const n = typeof raw === "number" ? raw : Number(raw);
        if (Number.isNaN(n)) {
          nonNumericInGroup = true;
          continue;
        }
        values.push(n);
      }
      if (nonNumericInGroup) nonNumericColumns.add(col);
      if (values.length === 0) {
        out[col] = 0;
        continue;
      }
      switch (fn) {
        case "sum":
          out[col] = values.reduce((a, b) => a + b, 0);
          break;
        case "avg":
          out[col] = values.reduce((a, b) => a + b, 0) / values.length;
          break;
        case "min":
          out[col] = Math.min(...values);
          break;
        case "max":
          out[col] = Math.max(...values);
          break;
      }
    }
    aggregated.push(out);
  }

  for (const col of nonNumericColumns) {
    warnings.push(
      `Column "${col}" contained non-numeric values during aggregation; missing/non-numeric entries were excluded.`
    );
  }

  return { rows: aggregated, headers: [...validGroupBy, ...metricColumns] };
}

function stringifyKeyPart(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function formatReportViewResponse(
  result: ReportViewOutput & { timestamp?: string },
  label = "Report data"
): string {
  const rowPayload = result.mode === "summary" ? (result.previewRows ?? []) : (result.rows ?? []);
  const rowLabel = result.mode === "summary" ? "Preview rows" : "Rows";
  const truncNote = result.truncated
    ? `\n\nShowing ${result.returnedRows} of ${result.totalRows} rows from this page. Next offset: ${result.nextOffset}`
    : "";
  const warnings =
    result.warnings.length > 0
      ? `\n\nWarnings:\n${result.warnings.map((warning) => `- ${warning}`).join("\n")}`
      : "";
  const timestamp = result.timestamp ? `\n\nTimestamp: ${result.timestamp}` : "";

  return `${label}: ${result.totalRows} rows, ${result.headers.length} columns\nMode: ${result.mode}\nColumns: ${result.headers.join(", ")}\nReturned columns: ${result.selectedColumns.join(", ")}${truncNote}${warnings}\n\n${rowLabel}:\n${JSON.stringify(rowPayload, null, 2)}${timestamp}`;
}

function resolveSelectedColumns(
  headers: string[],
  requestedColumns: string[] | undefined,
  warnings: string[]
): string[] {
  if (!requestedColumns || requestedColumns.length === 0) {
    return headers;
  }

  const headerSet = new Set(headers);
  const selectedColumns = requestedColumns.filter((column) => headerSet.has(column));
  const missingColumns = requestedColumns.filter((column) => !headerSet.has(column));

  if (missingColumns.length > 0) {
    warnings.push(`Unknown columns ignored: ${missingColumns.join(", ")}`);
  }

  if (selectedColumns.length === 0) {
    warnings.push(
      "No requested columns matched the report headers; returned row payloads are empty objects."
    );
  }

  return selectedColumns;
}

function projectRow(row: ReportViewRow, selectedColumns: string[]): ReportViewRow {
  const projected: ReportViewRow = {};
  for (const column of selectedColumns) {
    projected[column] = row[column] ?? "";
  }
  return projected;
}

const BOUNDED_VIEW_INPUT_KEYS = ["mode", "maxRows"] as const;
const BOUNDED_VIEW_OUTPUT_KEYS = [
  "mode",
  "totalRows",
  "returnedRows",
  "truncated",
  "nextOffset",
  "headers",
  "selectedColumns",
  "warnings",
] as const;

function unwrapZodObjectShape(schema: unknown): Record<string, unknown> | undefined {
  let current: any = schema;
  let safety = 16;
  while (current && safety-- > 0) {
    if (current.shape && typeof current.shape === "object") {
      return current.shape as Record<string, unknown>;
    }
    const def = current._def;
    if (!def) return undefined;
    if (def.schema) {
      current = def.schema;
      continue;
    }
    if (def.innerType) {
      current = def.innerType;
      continue;
    }
    return undefined;
  }
  return undefined;
}

export function isBoundedReportViewInputSchema(schema: unknown): boolean {
  const shape = unwrapZodObjectShape(schema);
  if (!shape) return false;
  return BOUNDED_VIEW_INPUT_KEYS.every((key) => key in shape);
}

export function getBoundedReportViewOutputMissingKeys(schema: unknown): string[] {
  const shape = unwrapZodObjectShape(schema);
  if (!shape) return [...BOUNDED_VIEW_OUTPUT_KEYS];
  return BOUNDED_VIEW_OUTPUT_KEYS.filter((key) => !(key in shape));
}
