import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { fetchWithTimeout } from "@cesteral/shared";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "ttd_download_report";
const TOOL_TITLE = "Download TTD Report";
const TOOL_DESCRIPTION = `Download and parse a TTD report from a download URL.

After generating a report with \`ttd_get_report\`, use the returned \`downloadUrl\` to fetch and parse the CSV data. Returns parsed rows as structured JSON.

**Workflow:**
1. Run \`ttd_get_report\` → get \`downloadUrl\`
2. Run \`ttd_download_report\` with that URL → get parsed data

**Options:**
- \`maxRows\` limits returned rows (default 1000) to avoid large payloads`;

export const DownloadReportInputSchema = z
  .object({
    downloadUrl: z
      .string()
      .url()
      .describe("Report download URL from ttd_get_report"),
    maxRows: z
      .number()
      .min(1)
      .max(10000)
      .optional()
      .describe("Maximum rows to return (default: 1000)"),
  })
  .describe("Parameters for downloading a TTD report");

export const DownloadReportOutputSchema = z
  .object({
    totalRows: z.number().describe("Total rows in the report"),
    returnedRows: z.number().describe("Number of rows returned"),
    truncated: z.boolean().describe("Whether rows were truncated"),
    headers: z.array(z.string()).describe("Column headers"),
    rows: z.array(z.record(z.any())).describe("Parsed data rows"),
    timestamp: z.string().datetime(),
  })
  .describe("Downloaded report data");

type DownloadInput = z.infer<typeof DownloadReportInputSchema>;
type DownloadOutput = z.infer<typeof DownloadReportOutputSchema>;

/**
 * Parse CSV text into an array of row objects keyed by header names.
 */
function parseCsv(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = csvText.replace(/\r\n/g, "\n").trim().split("\n");
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple CSV parse (handles quoted fields with commas)
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    values.push(current.trim());

    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length && j < values.length; j++) {
      row[headers[j]] = values[j];
    }
    rows.push(row);
  }

  return { headers, rows };
}

export async function downloadReportLogic(
  input: DownloadInput,
  _context: RequestContext,
  sdkContext?: SdkContext
): Promise<DownloadOutput> {
  // Resolve session to ensure the user is authenticated
  resolveSessionServices(sdkContext);

  const response = await fetchWithTimeout(input.downloadUrl, 60_000);
  if (!response.ok) {
    throw new Error(
      `Failed to download report: ${response.status} ${response.statusText}`
    );
  }

  const csvText = await response.text();
  const { headers, rows: allRows } = parseCsv(csvText);

  const maxRows = input.maxRows ?? 1000;
  const truncated = allRows.length > maxRows;
  const rows = allRows.slice(0, maxRows);

  return {
    totalRows: allRows.length,
    returnedRows: rows.length,
    truncated,
    headers,
    rows,
    timestamp: new Date().toISOString(),
  };
}

export function downloadReportResponseFormatter(result: DownloadOutput): any {
  const truncNote = result.truncated
    ? `\n\n⚠️ Showing ${result.returnedRows} of ${result.totalRows} rows (truncated)`
    : "";

  return [
    {
      type: "text" as const,
      text: `Report data: ${result.totalRows} rows, ${result.headers.length} columns\nColumns: ${result.headers.join(", ")}${truncNote}\n\n${JSON.stringify(result.rows.slice(0, 20), null, 2)}${result.returnedRows > 20 ? `\n\n... and ${result.returnedRows - 20} more rows` : ""}\n\nTimestamp: ${result.timestamp}`,
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
        downloadUrl: "https://reports.thetradedesk.com/results/abc123def456/report.csv",
      },
    },
    {
      label: "Download report with custom row limit",
      input: {
        downloadUrl: "https://reports.thetradedesk.com/results/xyz789uvw012/report.csv",
        maxRows: 5000,
      },
    },
  ],
  logic: downloadReportLogic,
  responseFormatter: downloadReportResponseFormatter,
};
