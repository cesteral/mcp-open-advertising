// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  arrayRowsToRecords,
  computeMetrics,
  createReportView,
  formatReportViewResponse,
  ReportViewInputSchema,
  ReportViewOutputSchema,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";
import { McpError, JsonRpcErrorCode } from "../../../utils/errors/index.js";

const TOOL_NAME = "cm360_download_report";
const TOOL_TITLE = "Download CM360 Report";
const TOOL_DESCRIPTION = `Download and parse a CM360 report from its download URL.

Use the downloadUrl from cm360_get_report or cm360_check_report_status. Returns a bounded summary or paged row slice.`;

export const DownloadReportInputSchema = z
  .object({
    downloadUrl: z
      .string()
      .url()
      .describe("Report download URL (from cm360_get_report or cm360_check_report_status)"),
    includeComputedMetrics: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include computed CPA, ROAS, CPM, CTR, CPC"),
  })
  .merge(ReportViewInputSchema)
  .describe("Parameters for downloading a CM360 report");

export const DownloadReportOutputSchema = z
  .object({
    ...ReportViewOutputSchema.shape,
    timestamp: z.string().datetime(),
  })
  .describe("Report download result");

type DownloadReportInput = z.infer<typeof DownloadReportInputSchema>;
type DownloadReportOutput = z.infer<typeof DownloadReportOutputSchema>;

export async function downloadReportLogic(
  input: DownloadReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DownloadReportOutput> {
  const { cm360ReportingService } = resolveSessionServices(sdkContext);

  const response = await cm360ReportingService.downloadReportFile(
    input.downloadUrl,
    30_000,
    context
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    const detail = errorBody ? ` — ${errorBody.substring(0, 500)}` : "";
    throw new Error(`Failed to download report: ${response.status} ${response.statusText}${detail}`);
  }

  const format = inferReportFormat(input.downloadUrl, response);
  if (format !== "CSV") {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Unsupported CM360 report format: ${format}. cm360_download_report only supports CSV downloads.`
    );
  }

  const csvText = await response.text();
  const rows = parseCSV(csvText);

  if (rows.length === 0) {
    return {
      headers: [],
      selectedColumns: [],
      totalRows: 0,
      returnedRows: 0,
      truncated: false,
      nextOffset: null,
      mode: input.mode ?? "summary",
      previewRows: input.mode === "rows" ? undefined : [],
      rows: input.mode === "rows" ? [] : undefined,
      warnings: [],
      timestamp: new Date().toISOString(),
    };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);

  let finalHeaders = headers;
  let finalRows = dataRows;

  if (input.includeComputedMetrics) {
    ({ headers: finalHeaders, rows: finalRows } = appendComputedMetricsToRows(headers, dataRows));
  }

  return {
    ...createReportView({
      headers: finalHeaders,
      rows: arrayRowsToRecords(finalHeaders, finalRows),
      totalRows: dataRows.length,
      input,
    }),
    timestamp: new Date().toISOString(),
  };
}

function appendComputedMetricsToRows(
  headers: string[],
  rows: string[][],
): { headers: string[]; rows: string[][] } {
  const idx = (...names: string[]) =>
    headers.findIndex((header) => names.some((name) => header.toLowerCase().includes(name.toLowerCase())));

  const spendIdx = idx("mediaCost", "cost");
  const impIdx = idx("impressions");
  const clickIdx = idx("clicks");
  const convIdx = idx("totalConversions", "conversions");
  const revenueIdx = idx("floodlightRevenue", "revenue", "totalRevenue");

  const computedColumns = [
    { name: "computed_cpa", enabled: spendIdx >= 0 && convIdx >= 0 },
    { name: "computed_roas", enabled: spendIdx >= 0 && revenueIdx >= 0 },
    { name: "computed_cpm", enabled: spendIdx >= 0 && impIdx >= 0 },
    { name: "computed_ctr", enabled: clickIdx >= 0 && impIdx >= 0 },
    { name: "computed_cpc", enabled: spendIdx >= 0 && clickIdx >= 0 },
  ].filter((column) => column.enabled);

  if (computedColumns.length === 0) {
    return { headers, rows };
  }

  const newHeaders = [...headers, ...computedColumns.map((column) => column.name)];
  const newRows = rows.map(row => {
    const cost = spendIdx >= 0 ? Number(row[spendIdx] || 0) : 0;
    const impressions = impIdx >= 0 ? Number(row[impIdx] || 0) : 0;
    const clicks = clickIdx >= 0 ? Number(row[clickIdx] || 0) : 0;
    const conversions = convIdx >= 0 ? Number(row[convIdx] || 0) : 0;
    const conversionValue = revenueIdx >= 0 ? Number(row[revenueIdx] || 0) : 0;
    const m = computeMetrics({ cost, impressions, clicks, conversions, conversionValue });
    const computedValues = computedColumns.map((column) => {
      switch (column.name) {
        case "computed_cpa":
          return m.cpa !== null ? String(m.cpa) : "";
        case "computed_roas":
          return m.roas !== null ? String(m.roas) : "";
        case "computed_cpm":
          return m.cpm !== null ? String(m.cpm) : "";
        case "computed_ctr":
          return m.ctr !== null ? String(m.ctr) : "";
        case "computed_cpc":
          return m.cpc !== null ? String(m.cpc) : "";
        default:
          return "";
      }
    });
    return [...row, ...computedValues];
  });
  return { headers: newHeaders, rows: newRows };
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        currentRow.push(current.trim());
        current = "";
      } else if (char === "\n") {
        currentRow.push(current.trim());
        if (currentRow.some((value) => value.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        current = "";
      } else if (char === "\r") {
        continue;
      } else {
        current += char;
      }
    }
  }
  if (current.length > 0 || currentRow.length > 0) {
    currentRow.push(current.trim());
    if (currentRow.some((value) => value.length > 0)) {
      rows.push(currentRow);
    }
  }
  return rows;
}

function inferReportFormat(downloadUrl: string, response: Response): "CSV" | "EXCEL" | "UNKNOWN" {
  const contentType = response.headers?.get?.("content-type")?.toLowerCase() ?? "";
  if (
    contentType.includes("spreadsheetml") ||
    contentType.includes("application/vnd.ms-excel")
  ) {
    return "EXCEL";
  }
  if (
    contentType.includes("text/csv") ||
    contentType.includes("application/csv") ||
    contentType.includes("text/plain")
  ) {
    return "CSV";
  }

  const normalizedUrl = downloadUrl.toLowerCase();
  if (normalizedUrl.includes(".csv") || normalizedUrl.includes("format=csv")) {
    return "CSV";
  }
  if (normalizedUrl.includes(".xls") || normalizedUrl.includes(".xlsx") || normalizedUrl.includes("format=excel")) {
    return "EXCEL";
  }

  return "UNKNOWN";
}

export function downloadReportResponseFormatter(result: DownloadReportOutput): McpTextContent[] {
  if (result.returnedRows === 0) {
    return [
      {
        type: "text" as const,
        text: `Report is empty — no data rows.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  return [
    {
      type: "text" as const,
      text: formatReportViewResponse(result, "Report data"),
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
      label: "Download a report",
      input: {
        downloadUrl: "https://dfareporting.googleapis.com/dfareporting/v5/userprofiles/123456/reports/789012/files/345678?alt=media",
        mode: "rows",
        maxRows: 50,
      },
    },
  ],
  logic: downloadReportLogic,
  responseFormatter: downloadReportResponseFormatter,
};
