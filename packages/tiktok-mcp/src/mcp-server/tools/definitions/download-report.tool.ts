// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { reportCsvStore } from "../../../services/session-services.js";
import {
  assertAccountScope,
  assertSafeDownloadUrl,
  ComputedMetricsFlagSchema,
  createServiceDownloadedReportView,
  formatReportViewResponse,
  ReportViewInputSchema,
  ReportViewOutputSchema,
  StoredReportBodyOutputSchema,
  spillBodyToGcs,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "tiktok_download_report";
const TOOL_TITLE = "Download TikTok Report";
const TOOL_DESCRIPTION = `Download and parse the output of a finished TikTok async report task.

Give the \`taskId\` from \`tiktok_submit_report\`. TikTok issues a signed download URL for the task (valid for one hour; this tool asks for a fresh one each call) and the CSV is fetched and parsed.

**Workflow:**
1. \`tiktok_submit_report\` → get \`taskId\`
2. \`tiktok_check_report_status\` → wait for state \`complete\`
3. \`tiktok_download_report\` with that \`taskId\` → get a bounded summary or paged row slice

Fails if the task is not finished, or was not created by \`tiktok_submit_report\` (other output formats are not supported).

**Options:**
- \`mode: "summary"\` (default) returns headers, counts, and a small preview
- \`mode: "rows"\` returns one bounded page of rows
- \`columns\` projects returned rows to selected columns (header names are TikTok field names, e.g. \`campaign_id\`, \`spend\`)
- \`offset\` and \`maxRows\` page through rows; \`maxRows\` is capped at 200`;

export const DownloadReportInputSchema = z
  .object({
    advertiserId: z.string().min(1).describe("TikTok Advertiser ID"),
    taskId: z.string().min(1).describe("Report task ID from tiktok_submit_report"),
    storeRawCsv: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Persist the full CSV body in the in-process report-csv store and return " +
          "a `report-csv://{id}` resource URI. Use when a downstream tool/user needs " +
          "the complete CSV but the model only needs a bounded preview. Entries " +
          "expire after 30 minutes. Sensitive token-like values are redacted before storage."
      ),
  })
  .merge(ReportViewInputSchema)
  .merge(ComputedMetricsFlagSchema)
  .describe("Parameters for downloading a TikTok report");

export const DownloadReportOutputSchema = z
  .object({
    ...ReportViewOutputSchema.shape,
    timestamp: z.string().datetime(),
    ...StoredReportBodyOutputSchema.shape,
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
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DownloadOutput> {
  const { tiktokReportingService, boundAdvertiserId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.advertiserId, boundAdvertiserId, "advertiserId");

  // TikTok issues the URL, but it is fetched server-side, so it is still
  // checked: refuse non-https, IP-literal and internal hosts before any fetch.
  const { downloadUrl } = await tiktokReportingService.getReportDownloadUrl(input.taskId, context);
  assertSafeDownloadUrl(downloadUrl, { toolName: TOOL_NAME });

  return createServiceDownloadedReportView({
    input,
    sessionId: sdkContext?.sessionId,
    reportCsvStore,
    spillBodyToGcs,
    spillServer: "tiktok",
    reportId: input.taskId,
    computedMetricAliases: TIKTOK_COMPUTED_METRIC_ALIASES,
    download: ({ fetchLimit, includeRawCsv }) =>
      tiktokReportingService.downloadReport(downloadUrl, fetchLimit, undefined, {
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
        advertiserId: "1234567890",
        taskId: "7001234567890123456",
      },
    },
    {
      label: "Download selected columns as a paged row slice",
      input: {
        advertiserId: "1234567890",
        taskId: "7001234567890123456",
        mode: "rows",
        columns: ["campaign_id", "impressions", "spend"],
        maxRows: 50,
      },
    },
  ],
  logic: downloadReportLogic,
  responseFormatter: downloadReportResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.headers", "$.selectedColumns", "$.rows", "$.previewRows", "$.warnings"],
    contentBlocks: [0],
  },
};
