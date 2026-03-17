// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "pinterest_download_report";
const TOOL_TITLE = "Download Pinterest Report";
const TOOL_DESCRIPTION = `Download and parse a Pinterest report from a download URL.

After a report task is DONE (via \`pinterest_check_report_status\`), use the \`downloadUrl\` to fetch and parse the CSV data.

**Workflow:**
1. \`pinterest_submit_report\` → get \`taskId\`
2. \`pinterest_check_report_status\` → get \`downloadUrl\` when DONE
3. \`pinterest_download_report\` with that URL → get parsed data

**Options:**
- \`maxRows\` limits returned rows (default 1000) to avoid large payloads`;

export const DownloadReportInputSchema = z
  .object({
    downloadUrl: z
      .string()
      .url()
      .describe("Report download URL from pinterest_check_report_status"),
    maxRows: z
      .number()
      .min(1)
      .max(10000)
      .optional()
      .describe("Maximum rows to return (default: 1000)"),
  })
  .describe("Parameters for downloading a Pinterest report");

export const DownloadReportOutputSchema = z
  .object({
    totalRows: z.number().describe("Total rows in the report"),
    returnedRows: z.number().describe("Number of rows returned"),
    truncated: z.boolean().describe("Whether rows were truncated"),
    headers: z.array(z.string()).describe("Column headers"),
    rows: z.array(z.array(z.string())).describe("Parsed data rows"),
    timestamp: z.string().datetime(),
  })
  .describe("Downloaded report data");

type DownloadInput = z.infer<typeof DownloadReportInputSchema>;
type DownloadOutput = z.infer<typeof DownloadReportOutputSchema>;

export async function downloadReportLogic(
  input: DownloadInput,
  _context: RequestContext,
  sdkContext?: SdkContext
): Promise<DownloadOutput> {
  const { pinterestReportingService } = resolveSessionServices(sdkContext);

  const maxRows = input.maxRows ?? 1000;
  const result = await pinterestReportingService.downloadReport(
    input.downloadUrl,
    maxRows
  );

  const truncated = result.totalRows > result.rows.length;

  return {
    totalRows: result.totalRows,
    returnedRows: result.rows.length,
    truncated,
    headers: result.headers,
    rows: result.rows,
    timestamp: new Date().toISOString(),
  };
}

export function downloadReportResponseFormatter(result: DownloadOutput): McpTextContent[] {
  const truncNote = result.truncated
    ? `\n\nShowing ${result.returnedRows} of ${result.totalRows} rows (truncated)`
    : "";

  const headerLine = result.headers.join(", ");
  const previewRows = result.rows.slice(0, 10).map((row) => row.join(", "));
  const moreRows = result.returnedRows > 10
    ? `\n... and ${result.returnedRows - 10} more rows`
    : "";

  return [
    {
      type: "text" as const,
      text: `Report data: ${result.totalRows} rows, ${result.headers.length} columns\nColumns: ${headerLine}${truncNote}\n\nSample rows:\n${previewRows.join("\n")}${moreRows}\n\nTimestamp: ${result.timestamp}`,
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
      label: "Download report CSV with default row limit",
      input: {
        downloadUrl: "https://analytics.pinterest.com/reports/task-abc123/report.csv",
      },
    },
    {
      label: "Download report with custom row limit",
      input: {
        downloadUrl: "https://analytics.pinterest.com/reports/task-xyz789/report.csv",
        maxRows: 5000,
      },
    },
  ],
  logic: downloadReportLogic,
  responseFormatter: downloadReportResponseFormatter,
};