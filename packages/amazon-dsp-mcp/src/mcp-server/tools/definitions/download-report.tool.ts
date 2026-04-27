// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { reportCsvStore } from "../../../services/session-services.js";
import {
  ComputedMetricsFlagSchema,
  createServiceDownloadedReportView,
  extractReportIdFromUrl,
  formatReportViewResponse,
  ReportViewInputSchema,
  ReportViewOutputSchema,
  StoredReportBodyOutputSchema,
  spillCsvToGcs,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "amazon_dsp_download_report";
const TOOL_TITLE = "Download AmazonDsp Report";
const TOOL_DESCRIPTION = `Download and parse a AmazonDsp report from a download URL.

After a report task is COMPLETED (via \`amazon_dsp_check_report_status\`), use the \`downloadUrl\` to fetch and parse the report data.

**Workflow:**
1. \`amazon_dsp_submit_report\` → get \`taskId\`
2. \`amazon_dsp_check_report_status\` → get \`downloadUrl\` when COMPLETED
3. \`amazon_dsp_download_report\` with that URL → get a bounded summary or paged row slice

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
      .describe("Report download URL from amazon_dsp_check_report_status"),
    storeRawCsv: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Persist the full report body (JSON or CSV, depending on report type) in " +
          "the in-process report-csv store and return a `report-csv://{id}` resource URI. " +
          "Entries expire after 30 minutes."
      ),
  })
  .merge(ReportViewInputSchema)
  .merge(ComputedMetricsFlagSchema)
  .describe("Parameters for downloading a AmazonDsp report");

export const DownloadReportOutputSchema = z
  .object({
    ...ReportViewOutputSchema.shape,
    timestamp: z.string().datetime(),
    ...StoredReportBodyOutputSchema.shape,
  })
  .describe("Downloaded report data");

type DownloadInput = z.infer<typeof DownloadReportInputSchema>;
type DownloadOutput = z.infer<typeof DownloadReportOutputSchema>;

const AMAZON_DSP_COMPUTED_METRIC_ALIASES = {
  cost: ["totalCost", "cost", "spend"],
  impressions: ["impressions"],
  clicks: ["clickThroughs", "clicks"],
  conversions: ["purchases14d", "purchases", "totalPurchases"],
  conversionValue: ["sales14d", "totalSales", "purchasesValue14d"],
};

export async function downloadReportLogic(
  input: DownloadInput,
  _context: RequestContext,
  sdkContext?: SdkContext
): Promise<DownloadOutput> {
  const { amazonDspReportingService } = resolveSessionServices(sdkContext);

  return createServiceDownloadedReportView({
    input,
    sessionId: sdkContext?.sessionId,
    reportCsvStore,
    spillCsvToGcs,
    spillServer: "amazonDsp",
    reportId: extractReportIdFromUrl(input.downloadUrl),
    computedMetricAliases: AMAZON_DSP_COMPUTED_METRIC_ALIASES,
    download: ({ fetchLimit, includeRawCsv }) =>
      amazonDspReportingService.downloadReport(input.downloadUrl, fetchLimit, undefined, {
        includeRawCsv,
      }),
  });
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
        downloadUrl: "https://analytics.amazonDsp.com/reports/task-abc123/report.csv",
      },
    },
    {
      label: "Download selected columns as a paged row slice",
      input: {
        downloadUrl: "https://analytics.amazonDsp.com/reports/task-xyz789/report.csv",
        mode: "rows",
        columns: ["lineItem", "impressions", "totalCost"],
        maxRows: 50,
      },
    },
  ],
  logic: downloadReportLogic,
  responseFormatter: downloadReportResponseFormatter,
};
