import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

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
  })
  .describe("Parameters for downloading a CM360 report");

export const DownloadReportOutputSchema = z
  .object({
    headers: z.array(z.string()).describe("Column headers"),
    rows: z.array(z.array(z.string())).describe("Data rows"),
    totalRows: z.number().describe("Total rows returned"),
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
  const { cm360HttpClient } = resolveSessionServices(sdkContext);

  const response = await cm360HttpClient.fetchRaw(
    input.downloadUrl,
    30_000,
    context,
    { method: "GET" }
  );

  if (!response.ok) {
    throw new Error(`Failed to download report: ${response.status} ${response.statusText}`);
  }

  const csvText = await response.text();
  const lines = csvText.split(/\r?\n/).filter((line: string) => line.trim().length > 0);

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
  const maxRows = input.maxRows ?? 1000;
  const dataLines = lines.slice(1);
  const truncated = dataLines.length > maxRows;
  const rows = dataLines.slice(0, maxRows).map(parseCSVLine);

  return {
    headers,
    rows,
    totalRows: rows.length,
    truncated,
    timestamp: new Date().toISOString(),
  };
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

export function downloadReportResponseFormatter(result: DownloadReportOutput): unknown[] {
  const truncatedNote = result.truncated
    ? `\n\nResults truncated to ${result.totalRows} rows.`
    : "";

  if (result.totalRows === 0) {
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
      text: `Report data (${result.totalRows} rows):\n\n${tableText}${truncatedNote}\n\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: false,
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
