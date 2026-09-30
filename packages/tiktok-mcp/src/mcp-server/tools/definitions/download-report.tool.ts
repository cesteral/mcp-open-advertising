// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import {
  ComputedMetricsFlagSchema,
  formatReportViewResponse,
  JsonRpcErrorCode,
  McpError,
  ReportViewInputSchema,
  ReportViewOutputSchema,
  StoredReportBodyOutputSchema,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";
import { TIKTOK_DOWNLOAD_REPORT_UNSUPPORTED_MESSAGE } from "../../../services/tiktok/tiktok-reporting-service.js";

const TOOL_NAME = "tiktok_download_report";
const TOOL_TITLE = "Download TikTok Report";
const TOOL_DESCRIPTION = `Download a finished TikTok async report — NOT AVAILABLE on TikTok.

TikTok's official Business API SDK defines no report-task download endpoint and no download URL on
the task-status response, so there is no documented URL to fetch. Every call returns an error and
nothing is downloaded.

Use \`tiktok_get_report\` (or \`tiktok_get_report_breakdowns\` for breakdowns), which runs the
report synchronously and returns the rows.`;

export const DownloadReportInputSchema = z
  .object({
    downloadUrl: z
      .string()
      .url()
      .describe("Report download URL. Never fetched: this tool always refuses (see description)."),
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

export async function downloadReportLogic(
  _input: DownloadInput,
  _context: RequestContext,
  _sdkContext?: SdkContext
): Promise<DownloadOutput> {
  // #232: TikTok's official SDK documents no report-task download endpoint and
  // no download URL on report/task/check/, so no URL this tool could receive
  // comes from a documented contract. Refuse before fetching anything.
  throw new McpError(JsonRpcErrorCode.InvalidRequest, TIKTOK_DOWNLOAD_REPORT_UNSUPPORTED_MESSAGE);
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
  untrustedContent: {
    structuredPaths: ["$.headers", "$.selectedColumns", "$.rows", "$.previewRows", "$.warnings"],
    contentBlocks: [0],
  },
};
