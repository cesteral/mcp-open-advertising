// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";

export const REPORT_SUMMARY_DEFAULT_ROWS = 10;
export const REPORT_ROWS_DEFAULT_ROWS = 50;
export const REPORT_MAX_RETURNED_ROWS = 200;

export const ReportViewModeSchema = z.enum(["summary", "rows"]);

export const ReportViewInputSchema = z.object({
  mode: ReportViewModeSchema
    .optional()
    .default("summary")
    .describe("Return mode. summary returns counts, columns, and previewRows. rows returns a bounded page of rows. Default: summary"),
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
    .describe("Maximum rows to return before the server cap is applied (default: 10 for summary, 50 for rows; hard cap: 200)"),
});

export const ReportViewOutputSchema = z.object({
  totalRows: z.number().describe("Total rows in the report"),
  returnedRows: z.number().describe("Number of rows returned in this response"),
  truncated: z.boolean().describe("Whether more rows are available"),
  nextOffset: z.number().nullable().describe("Next offset to request, or null when there are no more rows"),
  headers: z.array(z.string()).describe("Full column/header list"),
  selectedColumns: z.array(z.string()).describe("Columns included in returned row payloads"),
  mode: ReportViewModeSchema.describe("Return mode used for this response"),
  previewRows: z.array(z.record(z.any())).optional().describe("Small parsed row preview for summary mode"),
  rows: z.array(z.record(z.any())).optional().describe("Parsed data rows for rows mode"),
  warnings: z.array(z.string()).describe("Non-fatal warnings about projection, caps, or pagination"),
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
    params.input?.maxRows ?? (mode === "summary" ? REPORT_SUMMARY_DEFAULT_ROWS : REPORT_ROWS_DEFAULT_ROWS);
  const maxRows = getReportViewPageSize(params.input);
  const offset = params.input?.offset ?? 0;
  const warnings = [...(params.warnings ?? [])];
  const totalRows = params.totalRows ?? params.rows.length;
  const headers = params.headers && params.headers.length > 0
    ? params.headers
    : inferHeadersFromRows(params.rows);

  if (requestedMaxRows > REPORT_MAX_RETURNED_ROWS) {
    warnings.push(`maxRows capped at ${REPORT_MAX_RETURNED_ROWS} to keep the MCP response bounded.`);
  }

  if (offset > totalRows) {
    warnings.push(`offset ${offset} is beyond the report row count ${totalRows}; returned no rows.`);
  }

  const selectedColumns = resolveSelectedColumns(headers, params.input?.columns, warnings);
  const pageRows = params.rows.slice(offset, offset + maxRows).map((row) => projectRow(row, selectedColumns));
  const nextOffset = offset + pageRows.length < totalRows
    ? offset + pageRows.length
    : null;
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

export function formatReportViewResponse(
  result: ReportViewOutput & { timestamp?: string },
  label = "Report data"
): string {
  const rowPayload = result.mode === "summary"
    ? result.previewRows ?? []
    : result.rows ?? [];
  const rowLabel = result.mode === "summary" ? "Preview rows" : "Rows";
  const truncNote = result.truncated
    ? `\n\nShowing ${result.returnedRows} of ${result.totalRows} rows from this page. Next offset: ${result.nextOffset}`
    : "";
  const warnings = result.warnings.length > 0
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
    warnings.push("No requested columns matched the report headers; returned row payloads are empty objects.");
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
