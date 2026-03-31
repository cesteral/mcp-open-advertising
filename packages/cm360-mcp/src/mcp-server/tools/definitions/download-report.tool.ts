// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { computeMetrics } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "cm360_download_report";
const TOOL_TITLE = "Download CM360 Report";
const TOOL_DESCRIPTION = `Download and parse a CM360 report from its download URL.

Use the downloadUrl from cm360_get_report or cm360_check_report_status. Returns parsed CSV rows as JSON.`;

export const DownloadReportInputSchema = z
  .object({
    downloadUrl: z
      .string()
      .url()
      .describe("Report download URL (from cm360_get_report or cm360_check_report_status)"),
    maxRows: z
      .number()
      .min(1)
      .max(10000)
      .optional()
      .default(1000)
      .describe("Maximum number of rows to return (default: 1000)"),
    includeComputedMetrics: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include computed CPA, ROAS, CPM, CTR, CPC"),
  })
  .describe("Parameters for downloading a CM360 report");

export const DownloadReportOutputSchema = z
  .object({
    headers: z.array(z.string()).describe("Column headers"),
    rows: z.array(z.array(z.string())).describe("Data rows"),
    totalRows: z.number().describe("Total rows in the report (before truncation)"),
    returnedRows: z.number().describe("Number of rows actually returned"),
    truncated: z.boolean().describe("Whether results were truncated by maxRows"),
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

  const csvText = await response.text();
  const lines = csvText.split(/\r?\n/).filter((line: string) => line.trim().length > 0);

  if (lines.length === 0) {
    return {
      headers: [],
      rows: [],
      totalRows: 0,
      returnedRows: 0,
      truncated: false,
      timestamp: new Date().toISOString(),
    };
  }

  const headers = parseCSVLine(lines[0]);
  const maxRows = input.maxRows ?? 1000;
  const dataLines = lines.slice(1);
  const truncated = dataLines.length > maxRows;
  const rows = dataLines.slice(0, maxRows).map(parseCSVLine);

  let finalHeaders = headers;
  let finalRows = rows;

  if (input.includeComputedMetrics) {
    ({ headers: finalHeaders, rows: finalRows } = appendComputedMetricsToRows(headers, rows));
  }

  return {
    headers: finalHeaders,
    rows: finalRows,
    totalRows: dataLines.length,
    returnedRows: finalRows.length,
    truncated,
    timestamp: new Date().toISOString(),
  };
}

function appendComputedMetricsToRows(
  headers: string[],
  rows: string[][],
): { headers: string[]; rows: string[][] } {
  const idx = (name: string) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
  const spendIdx = idx('mediaCost');
  const impIdx = idx('impressions');
  const clickIdx = idx('clicks');
  const convIdx = idx('totalConversions');

  const newHeaders = [...headers, 'computed_cpa', 'computed_roas', 'computed_cpm', 'computed_ctr', 'computed_cpc'];
  const newRows = rows.map(row => {
    const cost = spendIdx >= 0 ? Number(row[spendIdx] || 0) : 0;
    const impressions = impIdx >= 0 ? Number(row[impIdx] || 0) : 0;
    const clicks = clickIdx >= 0 ? Number(row[clickIdx] || 0) : 0;
    const conversions = convIdx >= 0 ? Number(row[convIdx] || 0) : 0;
    const m = computeMetrics({ cost, impressions, clicks, conversions, conversionValue: 0 });
    return [...row,
      m.cpa !== null ? String(m.cpa) : '',
      m.roas !== null ? String(m.roas) : '',
      m.cpm !== null ? String(m.cpm) : '',
      m.ctr !== null ? String(m.ctr) : '',
      m.cpc !== null ? String(m.cpc) : '',
    ];
  });
  return { headers: newHeaders, rows: newRows };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
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
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());
  return result;
}

export function downloadReportResponseFormatter(result: DownloadReportOutput): McpTextContent[] {
  const truncatedNote = result.truncated
    ? `\n\nResults truncated to ${result.returnedRows} of ${result.totalRows} rows.`
    : "";

  if (result.returnedRows === 0) {
    return [
      {
        type: "text" as const,
        text: `Report is empty — no data rows.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  const table = [result.headers, ...result.rows];
  const tableText = table.map((row) => row.join("\t")).join("\n");

  return [
    {
      type: "text" as const,
      text: `Report data (${result.returnedRows} rows):\n\n${tableText}${truncatedNote}\n\nTimestamp: ${result.timestamp}`,
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
        maxRows: 500,
      },
    },
  ],
  logic: downloadReportLogic,
  responseFormatter: downloadReportResponseFormatter,
};