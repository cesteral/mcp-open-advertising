// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { reportCsvStore } from "../../../services/session-services.js";
import {
  ComputedMetricsFlagSchema,
  McpError,
  JsonRpcErrorCode,
  ReportViewInputSchema,
  ReportViewOutputSchema,
  StoredReportBodyOutputSchema,
  assertAccountScope,
  createServiceDownloadedReportView,
  formatReportViewResponse,
  spillBodyToGcs,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "{{key}}_download_report";
const TOOL_TITLE = "Download {{displayName}} Report";
const TOOL_DESCRIPTION = `Download a finished {{displayName}} report job (see \`{{key}}_check_report_status\`) as a bounded view of its rows. Set \`storeRawCsv\` to keep the whole CSV as a \`report-csv://\` resource.`;

export const DownloadReportInputSchema = z
  .object({
    accountId: z.string().min(1).describe("{{displayName}} account ID"),
    reportId: z.string().min(1).describe("Report job ID from {{key}}_submit_report"),
    storeRawCsv: z
      .boolean()
      .optional()
      .default(false)
      .describe("Keep the full CSV as a report-csv:// resource (30 minutes) and return its URI."),
  })
  .merge(ReportViewInputSchema)
  .merge(ComputedMetricsFlagSchema)
  .describe("Parameters for downloading a {{displayName}} report");

export const DownloadReportOutputSchema = z
  .object({
    ...ReportViewOutputSchema.shape,
    timestamp: z.string().datetime(),
    ...StoredReportBodyOutputSchema.shape,
  })
  .describe("Downloaded report data");

type Input = z.infer<typeof DownloadReportInputSchema>;
type Output = z.infer<typeof DownloadReportOutputSchema>;

/** TODO(scaffold): map the platform's column names for computed metrics (CTR, CPC, …). */
const COMPUTED_METRIC_ALIASES = {
  cost: ["spend", "cost"],
  impressions: ["impressions"],
  clicks: ["clicks"],
  conversions: ["conversions"],
};

export async function downloadReportLogic(
  input: Input,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<Output> {
  const { {{key}}ReportingService, boundAccountId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.accountId, boundAccountId, "accountId");
  // The URL comes from the platform's status response, never from the caller.
  const status = await {{key}}ReportingService.getReportStatus(
    input.accountId,
    input.reportId,
    context
  );
  if (status.state !== "complete" || !status.downloadUrl) {
    throw new McpError(
      JsonRpcErrorCode.InvalidRequest,
      `Report ${input.reportId} is ${status.state}; download it once {{key}}_check_report_status reports isComplete`
    );
  }
  const downloadUrl = status.downloadUrl;
  return createServiceDownloadedReportView({
    input,
    sessionId: sdkContext?.sessionId,
    reportCsvStore,
    spillBodyToGcs,
    spillServer: "{{key}}",
    reportId: input.reportId,
    computedMetricAliases: COMPUTED_METRIC_ALIASES,
    download: ({ fetchLimit, includeRawCsv }) =>
      {{key}}ReportingService.downloadReport(downloadUrl, fetchLimit, context, { includeRawCsv }),
  });
}

export function downloadReportResponseFormatter(result: Output): McpTextContent[] {
  return [{ type: "text" as const, text: formatReportViewResponse(result, "Report data") }];
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
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    { label: "Download a finished report", input: { accountId: "1234567890", reportId: "r-123" } },
  ],
  logic: downloadReportLogic,
  responseFormatter: downloadReportResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.headers", "$.selectedColumns", "$.rows", "$.previewRows", "$.warnings"],
    contentBlocks: [0],
  },
};
