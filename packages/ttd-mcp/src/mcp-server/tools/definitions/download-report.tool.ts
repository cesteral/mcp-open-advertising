// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  appendComputedMetricsToRows,
  ComputedMetricsFlagSchema,
  createReportView,
  fetchWithTimeout,
  formatReportViewResponse,
  parseCSV,
  ReportViewInputSchema,
  ReportViewOutputSchema,
} from "@cesteral/shared";
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

export const DownloadReportInputSchema = z
  .object({
    downloadUrl: z
      .string()
      .url()
      .describe("Report download URL from ttd_get_report"),
  })
  .merge(ReportViewInputSchema)
  .merge(ComputedMetricsFlagSchema)
  .describe("Parameters for downloading a TTD report");

export const DownloadReportOutputSchema = z
  .object({
    ...ReportViewOutputSchema.shape,
    timestamp: z.string().datetime(),
  })
  .describe("Downloaded report data");

type DownloadInput = z.infer<typeof DownloadReportInputSchema>;
type DownloadOutput = z.infer<typeof DownloadReportOutputSchema>;

const TTD_COMPUTED_METRIC_ALIASES = {
  cost: ["TotalCost", "AdvertiserCost", "PartnerCost"],
  impressions: ["Impressions"],
  clicks: ["Clicks"],
  conversions: ["TotalConversions", "Conversions"],
  conversionValue: ["TotalConversionsValue", "ConversionValue"],
};

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
  const { headers, rows } = parseCSV(csvText);

  const augmented = input.includeComputedMetrics
    ? appendComputedMetricsToRows(rows, TTD_COMPUTED_METRIC_ALIASES)
    : rows;
  const augmentedHeaders = input.includeComputedMetrics
    ? [...headers, "cpa", "roas", "cpm", "ctr", "cpc"]
    : headers;

  return {
    ...createReportView({
      headers: augmentedHeaders,
      rows: augmented,
      input,
    }),
    timestamp: new Date().toISOString(),
  };
}

export function downloadReportResponseFormatter(result: DownloadOutput): McpTextContent[] {
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
