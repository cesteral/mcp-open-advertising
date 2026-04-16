// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { reportCsvStore } from "../../../services/session-services.js";
import {
  appendComputedMetricsToRows,
  buildReportCsvUri,
  ComputedMetricsFlagSchema,
  createReportView,
  formatReportViewResponse,
  getReportViewFetchLimit,
  ReportViewInputSchema,
  ReportViewOutputSchema,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "pinterest_download_report";
const TOOL_TITLE = "Download Pinterest Report";
const TOOL_DESCRIPTION = `Download and parse a Pinterest report from a download URL.

After a report task is DONE (via \`pinterest_check_report_status\`), use the \`downloadUrl\` to fetch and parse the CSV data.

**Workflow:**
1. \`pinterest_submit_report\` → get \`taskId\`
2. \`pinterest_check_report_status\` → get \`downloadUrl\` when DONE
3. \`pinterest_download_report\` with that URL → get a bounded summary or paged row slice

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
      .describe("Report download URL from pinterest_check_report_status"),
    storeRawCsv: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Persist the full CSV body in the in-process report-csv store and return a `report-csv://{id}` resource URI. " +
        "Use when a downstream tool/user needs the complete CSV but the model only needs a bounded preview. " +
        "Entries expire after 30 minutes. Sensitive token-like values are redacted before storage."
      ),
  })
  .merge(ReportViewInputSchema)
  .merge(ComputedMetricsFlagSchema)
  .describe("Parameters for downloading a Pinterest report");

export const DownloadReportOutputSchema = z
  .object({
    ...ReportViewOutputSchema.shape,
    timestamp: z.string().datetime(),
    rawCsvResourceUri: z
      .string()
      .optional()
      .describe("MCP resource URI of the persisted raw CSV (only present when storeRawCsv is true)"),
    rawCsvByteLength: z
      .number()
      .optional()
      .describe("Stored CSV size in bytes (after redaction and any truncation)"),
  })
  .describe("Downloaded report data");

type DownloadInput = z.infer<typeof DownloadReportInputSchema>;
type DownloadOutput = z.infer<typeof DownloadReportOutputSchema>;

const PINTEREST_COMPUTED_METRIC_ALIASES = {
  cost: ["SPEND_IN_DOLLAR", "SPEND_IN_MICRO_DOLLAR"],
  impressions: ["IMPRESSION_1", "IMPRESSION_2", "IMPRESSIONS"],
  clicks: ["CLICKTHROUGH_1", "CLICKTHROUGH_2", "CLICKS"],
  conversions: ["TOTAL_CONVERSIONS", "TOTAL_CHECKOUT", "CONVERSIONS"],
  conversionValue: ["TOTAL_CONVERSIONS_VALUE_IN_MICRO_DOLLAR", "TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR"],
};

export async function downloadReportLogic(
  input: DownloadInput,
  _context: RequestContext,
  sdkContext?: SdkContext
): Promise<DownloadOutput> {
  const { pinterestReportingService } = resolveSessionServices(sdkContext);

  const result = await pinterestReportingService.downloadReport(
    input.downloadUrl,
    getReportViewFetchLimit(input),
    undefined,
    { includeRawCsv: input.storeRawCsv === true }
  );

  const recordRows: Record<string, string>[] = result.rows.map((row) => {
    const record: Record<string, string> = {};
    for (let i = 0; i < result.headers.length; i++) {
      record[result.headers[i] ?? String(i)] = row[i] ?? "";
    }
    return record;
  });
  const augmented = input.includeComputedMetrics
    ? appendComputedMetricsToRows(recordRows, PINTEREST_COMPUTED_METRIC_ALIASES)
    : recordRows;
  const computedWarning = input.includeComputedMetrics
    ? augmented[0]?._computedMetricsWarnings
    : undefined;
  const augmentedHeaders = input.includeComputedMetrics
    ? [...result.headers, "cpa", "roas", "cpm", "ctr", "cpc"]
    : result.headers;

  const view = createReportView({
    headers: augmentedHeaders,
    rows: augmented,
    totalRows: result.totalRows,
    input,
    warnings: computedWarning
      ? [`computed metrics: ${computedWarning}`]
      : undefined,
  });

  const extras: { rawCsvResourceUri?: string; rawCsvByteLength?: number } = {};
  if (input.storeRawCsv === true && result.rawCsv !== undefined) {
    const entry = reportCsvStore.store({
      csv: result.rawCsv,
      mimeType: "text/csv",
      sessionId: sdkContext?.sessionId,
    });
    extras.rawCsvResourceUri = buildReportCsvUri(entry.resourceId);
    extras.rawCsvByteLength = entry.byteLength;
    if (entry.warnings.length > 0) {
      view.warnings = [...view.warnings, ...entry.warnings];
    }
  }

  return {
    ...view,
    timestamp: new Date().toISOString(),
    ...extras,
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
        downloadUrl: "https://analytics.pinterest.com/reports/task-abc123/report.csv",
      },
    },
    {
      label: "Download selected columns as a paged row slice",
      input: {
        downloadUrl: "https://analytics.pinterest.com/reports/task-xyz789/report.csv",
        mode: "rows",
        columns: ["CAMPAIGN_ID", "IMPRESSION_1", "SPEND_IN_DOLLAR"],
        maxRows: 50,
      },
    },
  ],
  logic: downloadReportLogic,
  responseFormatter: downloadReportResponseFormatter,
};
