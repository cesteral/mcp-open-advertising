// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  appendComputedMetricsToRows,
  ComputedMetricsFlagSchema,
  createReportView,
  formatReportViewResponse,
  getReportViewFetchLimit,
  ReportViewInputSchema,
  ReportViewOutputSchema,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "tiktok_download_report";
const TOOL_TITLE = "Download TikTok Report";
const TOOL_DESCRIPTION = `Download and parse a TikTok report from a download URL.

After a report task is DONE (via \`tiktok_check_report_status\`), use the \`downloadUrl\` to fetch and parse the CSV data.

**Workflow:**
1. \`tiktok_submit_report\` → get \`taskId\`
2. \`tiktok_check_report_status\` → get \`downloadUrl\` when DONE
3. \`tiktok_download_report\` with that URL → get a bounded summary or paged row slice

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
      .describe("Report download URL from tiktok_check_report_status"),
  })
  .merge(ReportViewInputSchema)
  .merge(ComputedMetricsFlagSchema)
  .describe("Parameters for downloading a TikTok report");

export const DownloadReportOutputSchema = z
  .object({
    ...ReportViewOutputSchema.shape,
    timestamp: z.string().datetime(),
  })
  .describe("Downloaded report data");

type DownloadInput = z.infer<typeof DownloadReportInputSchema>;
type DownloadOutput = z.infer<typeof DownloadReportOutputSchema>;

const TIKTOK_COMPUTED_METRIC_ALIASES = {
  cost: ["spend", "cost"],
  impressions: ["impressions"],
  clicks: ["clicks"],
  conversions: ["conversions"],
  conversionValue: ["conversion_value", "total_purchase_value"],
};

export async function downloadReportLogic(
  input: DownloadInput,
  _context: RequestContext,
  sdkContext?: SdkContext
): Promise<DownloadOutput> {
  const { tiktokReportingService } = resolveSessionServices(sdkContext);

  const result = await tiktokReportingService.downloadReport(
    input.downloadUrl,
    getReportViewFetchLimit(input)
  );

  const recordRows: Record<string, string>[] = result.rows.map((row) => {
    const record: Record<string, string> = {};
    for (let i = 0; i < result.headers.length; i++) {
      record[result.headers[i] ?? String(i)] = row[i] ?? "";
    }
    return record;
  });
  const augmented = input.includeComputedMetrics
    ? appendComputedMetricsToRows(recordRows, TIKTOK_COMPUTED_METRIC_ALIASES)
    : recordRows;
  const computedWarning = input.includeComputedMetrics
    ? augmented[0]?._computedMetricsWarnings
    : undefined;
  const augmentedHeaders = input.includeComputedMetrics
    ? [...result.headers, "cpa", "roas", "cpm", "ctr", "cpc"]
    : result.headers;

  return {
    ...createReportView({
      headers: augmentedHeaders,
      rows: augmented,
      totalRows: result.totalRows,
      input,
      warnings: computedWarning
        ? [`computed metrics: ${computedWarning}`]
        : undefined,
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
        downloadUrl: "https://analytics.tiktok.com/reports/task-abc123/report.csv",
      },
    },
    {
      label: "Download selected columns as a paged row slice",
      input: {
        downloadUrl: "https://analytics.tiktok.com/reports/task-xyz789/report.csv",
        mode: "rows",
        columns: ["campaign_id", "impressions", "spend"],
        maxRows: 50,
      },
    },
  ],
  logic: downloadReportLogic,
  responseFormatter: downloadReportResponseFormatter,
};
