// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "sa360_download_report";
const TOOL_TITLE = "Download SA360 Report";
const TOOL_DESCRIPTION = `Download a completed SA360 async report file.

Use the download URL from \`sa360_check_report_status\` (when isReportReady is true). Returns parsed CSV data as structured JSON rows.

**Workflow:** sa360_submit_report → sa360_check_report_status → **sa360_download_report**`;

export const DownloadReportInputSchema = z
  .object({
    downloadUrl: z
      .string()
      .min(1)
      .describe("Download URL from sa360_check_report_status file list"),
    maxRows: z
      .number()
      .min(1)
      .max(10000)
      .optional()
      .default(1000)
      .describe("Maximum rows to return (default 1000, max 10000). Large reports are truncated."),
  })
  .describe("Parameters for downloading a report file");

export const DownloadReportOutputSchema = z
  .object({
    headers: z.array(z.string()).describe("Column headers from the CSV"),
    rows: z.array(z.array(z.string())).describe("Data rows (array of arrays)"),
    totalRows: z.number().describe("Total rows parsed from the file"),
    truncated: z.boolean().describe("Whether the output was truncated due to maxRows"),
    timestamp: z.string().datetime(),
  })
  .describe("Parsed report data");

type DownloadReportInput = z.infer<typeof DownloadReportInputSchema>;
type DownloadReportOutput = z.infer<typeof DownloadReportOutputSchema>;

/**
 * Parse a CSV line handling quoted fields with commas and escaped quotes.
 */
export function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}

export async function downloadReportLogic(
  input: DownloadReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DownloadReportOutput> {
  const { reportingService } = resolveSessionServices(sdkContext);

  const csvData = await reportingService.downloadReport(input.downloadUrl, context);

  // Parse CSV
  const lines = csvData.split("\n").filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    return {
      headers: [],
      rows: [],
      totalRows: 0,
      truncated: false,
      timestamp: new Date().toISOString(),
    };
  }

  const headers = parseCSVLine(lines[0]);
  const dataLines = lines.slice(1);
  const totalRows = dataLines.length;
  const maxRows = input.maxRows ?? 1000;
  const truncated = totalRows > maxRows;
  const rowsToReturn = truncated ? dataLines.slice(0, maxRows) : dataLines;
  const rows = rowsToReturn.map((line) => parseCSVLine(line));

  return {
    headers,
    rows,
    totalRows,
    truncated,
    timestamp: new Date().toISOString(),
  };
}

export function downloadReportResponseFormatter(result: DownloadReportOutput): McpTextContent[] {
  const truncNote = result.truncated
    ? ` (showing first ${result.rows.length} of ${result.totalRows})`
    : "";
  return [
    {
      type: "text" as const,
      text: `Report downloaded: ${result.totalRows} rows, ${result.headers.length} columns${truncNote}\n\nHeaders: ${result.headers.join(", ")}\n\n${JSON.stringify(result.rows.slice(0, 20), null, 2)}${result.rows.length > 20 ? `\n\n... and ${result.rows.length - 20} more rows` : ""}\n\nTimestamp: ${result.timestamp}`,
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
    idempotentHint: true,
    openWorldHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Download a completed report",
      input: {
        downloadUrl: "https://www.googleapis.com/doubleclicksearch/v2/reports/12345/files/0",
        maxRows: 500,
      },
    },
  ],
  logic: downloadReportLogic,
  responseFormatter: downloadReportResponseFormatter,
};
