// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { fetchWithTimeout, parseCsvLine } from "@cesteral/shared";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_download_report";
const TOOL_TITLE = "Download TTD Report";
const TOOL_DESCRIPTION = `Download and parse a TTD report from a download URL.

After generating a report with \`ttd_get_report\`, use the returned \`downloadUrl\` to fetch and parse the CSV data. TTD-hosted report URLs require server-side \`TTD-Auth\`, so this tool fetches the report and returns a bounded view that stays within MCP response-size limits.

**Workflow:**
1. Run \`ttd_get_report\` → get \`downloadUrl\`
2. Run \`ttd_download_report\` with that URL → get a summary preview or a paged row slice

**Options:**
- \`mode: "summary"\` (default) returns headers, counts, and a small preview
- \`mode: "rows"\` returns one bounded page of rows
- \`columns\` projects returned rows to selected columns
- \`offset\` and \`maxRows\` page through rows; \`maxRows\` is capped at 200`;

const SUMMARY_DEFAULT_MAX_ROWS = 10;
const ROWS_DEFAULT_MAX_ROWS = 50;
const MAX_RETURNED_ROWS = 200;

export const DownloadReportInputSchema = z
  .object({
    downloadUrl: z
      .string()
      .url()
      .describe("Report download URL from ttd_get_report"),
    maxRows: z
      .number()
      .int()
      .min(1)
      .max(10000)
      .optional()
      .describe("Maximum rows to return before the server cap is applied (default: 10 for summary, 50 for rows; hard cap: 200)"),
    mode: z
      .enum(["summary", "rows"])
      .optional()
      .describe("Return mode. summary returns counts, headers, and previewRows. rows returns a bounded page of rows. Default: summary"),
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
  })
  .describe("Parameters for downloading a TTD report");

export const DownloadReportOutputSchema = z
  .object({
    totalRows: z.number().describe("Total rows in the report"),
    returnedRows: z.number().describe("Number of rows returned"),
    truncated: z.boolean().describe("Whether rows were truncated"),
    nextOffset: z.number().nullable().describe("Next offset to request, or null when there are no more rows"),
    headers: z.array(z.string()).describe("Column headers"),
    selectedColumns: z.array(z.string()).describe("Columns included in returned row payloads"),
    mode: z.enum(["summary", "rows"]).describe("Return mode used for this response"),
    previewRows: z.array(z.record(z.string())).optional().describe("Small parsed row preview for summary mode"),
    rows: z.array(z.record(z.string())).optional().describe("Parsed data rows for rows mode"),
    warnings: z.array(z.string()).describe("Non-fatal warnings about projection, caps, or pagination"),
    timestamp: z.string().datetime(),
  })
  .describe("Downloaded report data");

type DownloadInput = z.infer<typeof DownloadReportInputSchema>;
type DownloadOutput = z.infer<typeof DownloadReportOutputSchema>;

/**
 * Parse CSV text into an array of row objects keyed by header names.
 */
function parseCsv(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const normalized = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return { headers: [], rows: [] };

  const lines = normalized.split("\n");
  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length && j < values.length; j++) {
      row[headers[j]] = values[j];
    }
    rows.push(row);
  }

  return { headers, rows };
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

function projectRows(
  rows: Record<string, string>[],
  selectedColumns: string[]
): Record<string, string>[] {
  return rows.map((row) => {
    const projected: Record<string, string> = {};
    for (const column of selectedColumns) {
      projected[column] = row[column] ?? "";
    }
    return projected;
  });
}

const ALLOWED_REPORT_HOSTNAME_PATTERN = /(?:^|\.)(?:thetradedesk\.com|amazonaws\.com)$/;

function isAllowedReportUrl(rawUrl: string): boolean {
  try {
    const { hostname } = new URL(rawUrl);
    return ALLOWED_REPORT_HOSTNAME_PATTERN.test(hostname);
  } catch {
    return false;
  }
}

function detectBinarySpreadsheet(
  bytes: Uint8Array,
  contentType: string | null,
  downloadUrl: string
): string | null {
  const normalizedType = contentType?.toLowerCase() ?? "";
  const lowerUrl = downloadUrl.toLowerCase();

  const isZipSignature =
    bytes.length >= 4
    && bytes[0] === 0x50
    && bytes[1] === 0x4b
    && bytes[2] === 0x03
    && bytes[3] === 0x04;

  const looksLikeSpreadsheet =
    normalizedType.includes("spreadsheetml")
    || normalizedType.includes("application/zip")
    || normalizedType.includes("application/octet-stream")
    || lowerUrl.includes(".xlsx")
    || isZipSignature;

  if (!looksLikeSpreadsheet) return null;

  return (
    "This download appears to be an XLSX/ExcelPivot report, not CSV. " +
    "ttd_download_report currently supports CSV parsing only. " +
    "Regenerate the report in CSV format or use a CSV-based report workflow before calling this tool."
  );
}

export async function downloadReportLogic(
  input: DownloadInput,
  _context: RequestContext,
  sdkContext?: SdkContext
): Promise<DownloadOutput> {
  const { authAdapter } = resolveSessionServices(sdkContext);

  if (!isAllowedReportUrl(input.downloadUrl)) {
    throw new Error(
      `Report download URL must be from *.thetradedesk.com or *.amazonaws.com. Got: ${new URL(input.downloadUrl).hostname}`
    );
  }

  // TTD-hosted download URLs (api.thetradedesk.com/v3/myreports/view/...) require
  // the TTD-Auth header. Pre-signed AWS S3 URLs carry their own signature and
  // must NOT receive auth headers (would 400/403).
  const { hostname } = new URL(input.downloadUrl);
  const requestInit: RequestInit = /thetradedesk\.com$/.test(hostname)
    ? { headers: { "TTD-Auth": await authAdapter.getAccessToken() } }
    : {};

  const response = await fetchWithTimeout(input.downloadUrl, 60_000, undefined, requestInit);
  if (!response.ok) {
    throw new Error(
      `Failed to download report: ${response.status} ${response.statusText}`
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type");
  const binarySpreadsheetError = detectBinarySpreadsheet(
    bytes,
    contentType,
    input.downloadUrl
  );
  if (binarySpreadsheetError) {
    throw new Error(binarySpreadsheetError);
  }

  const csvText = new TextDecoder("utf-8").decode(bytes);
  const { headers, rows: allRows } = parseCsv(csvText);

  const mode = input.mode ?? "summary";
  const requestedMaxRows = input.maxRows ?? (mode === "summary" ? SUMMARY_DEFAULT_MAX_ROWS : ROWS_DEFAULT_MAX_ROWS);
  const maxRows = Math.min(requestedMaxRows, MAX_RETURNED_ROWS);
  const offset = input.offset ?? 0;
  const warnings: string[] = [];

  if (requestedMaxRows > MAX_RETURNED_ROWS) {
    warnings.push(`maxRows capped at ${MAX_RETURNED_ROWS} to keep the MCP response bounded.`);
  }

  if (offset > allRows.length) {
    warnings.push(`offset ${offset} is beyond the report row count ${allRows.length}; returned no rows.`);
  }

  const selectedColumns = resolveSelectedColumns(headers, input.columns, warnings);
  const pageRows = projectRows(allRows.slice(offset, offset + maxRows), selectedColumns);
  const nextOffset = offset + pageRows.length < allRows.length
    ? offset + pageRows.length
    : null;
  const truncated = nextOffset !== null;

  if (truncated) {
    warnings.push(`More rows are available. Call again with offset ${nextOffset}.`);
  }

  const rowPayload = mode === "summary"
    ? { previewRows: pageRows }
    : { rows: pageRows };

  return {
    totalRows: allRows.length,
    returnedRows: pageRows.length,
    truncated,
    nextOffset,
    headers,
    selectedColumns,
    mode,
    ...rowPayload,
    warnings,
    timestamp: new Date().toISOString(),
  };
}

export function downloadReportResponseFormatter(result: DownloadOutput): McpTextContent[] {
  const truncNote = result.truncated
    ? `\n\nShowing ${result.returnedRows} of ${result.totalRows} rows from this page. Next offset: ${result.nextOffset}`
    : "";
  const rowPayload = result.mode === "summary"
    ? result.previewRows ?? []
    : result.rows ?? [];
  const rowLabel = result.mode === "summary" ? "Preview rows" : "Rows";
  const warnings = result.warnings.length > 0
    ? `\n\nWarnings:\n${result.warnings.map((warning) => `- ${warning}`).join("\n")}`
    : "";

  return [
    {
      type: "text" as const,
      text: `Report data: ${result.totalRows} rows, ${result.headers.length} columns\nMode: ${result.mode}\nColumns: ${result.headers.join(", ")}\nReturned columns: ${result.selectedColumns.join(", ")}${truncNote}${warnings}\n\n${rowLabel}:\n${JSON.stringify(rowPayload, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const downloadReportTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: DownloadReportInputSchema,
  outputSchema: DownloadReportOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Download report summary preview",
      input: {
        downloadUrl: "https://reports.thetradedesk.com/results/abc123def456/report.csv",
      },
    },
    {
      label: "Download selected columns as a paged row slice",
      input: {
        downloadUrl: "https://reports.thetradedesk.com/results/xyz789uvw012/report.csv",
        mode: "rows",
        columns: ["Site", "Impressions", "TotalCost"],
        maxRows: 50,
      },
    },
  ],
  logic: downloadReportLogic,
  responseFormatter: downloadReportResponseFormatter,
};
