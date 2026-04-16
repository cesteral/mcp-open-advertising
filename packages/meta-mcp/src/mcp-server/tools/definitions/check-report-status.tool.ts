// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { fromMetaStatus, ReportStatusSchema } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "meta_check_report_status";
const TOOL_TITLE = "Check Meta Report Status";
const TOOL_DESCRIPTION = `Check the status of an async Meta Ads insights report job.

Poll this tool after \`meta_submit_report\` until \`isComplete\` is true, then call \`meta_download_report\`.

**Canonical states:** \`pending\`, \`running\`, \`complete\`, \`failed\`, \`cancelled\`.
Meta source states are mapped — "Job Completed" → \`complete\`, "Job Failed" → \`failed\`, "Job Started"/"Job Running" → \`running\`, everything else → \`pending\`. The original Meta status string is returned as \`rawStatus\`.`;

export const CheckReportStatusInputSchema = z
  .object({
    reportRunId: z
      .string()
      .min(1)
      .describe("Report run ID from meta_submit_report"),
  })
  .describe("Parameters for checking a Meta report status");

export const CheckReportStatusOutputSchema = ReportStatusSchema.extend({
  reportRunId: z.string(),
  rawStatus: z
    .string()
    .describe("Raw Meta async_status string (e.g. 'Job Completed', 'Job Running')"),
  isComplete: z
    .boolean()
    .describe("True when canonical state is 'complete' — safe to call meta_download_report"),
  asyncPercentCompletion: z
    .number()
    .optional()
    .describe("Completion percentage (0–100)"),
  errorCode: z.number().optional().describe("Meta error code (set when state is 'failed')"),
  errorMessage: z
    .string()
    .optional()
    .describe("Meta error message (set when state is 'failed')"),
  errorSubcode: z
    .number()
    .optional()
    .describe("Meta error subcode (set when state is 'failed')"),
  errorUserTitle: z
    .string()
    .optional()
    .describe("User-facing error title (set when state is 'failed')"),
  errorUserMsg: z
    .string()
    .optional()
    .describe("User-facing error message (set when state is 'failed')"),
  timestamp: z.string().datetime(),
}).describe("Report status check result");

type CheckReportStatusInput = z.infer<typeof CheckReportStatusInputSchema>;
type CheckReportStatusOutput = z.infer<typeof CheckReportStatusOutputSchema>;

export async function checkReportStatusLogic(
  input: CheckReportStatusInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CheckReportStatusOutput> {
  const { metaInsightsService } = resolveSessionServices(sdkContext);

  const result = await metaInsightsService.checkReportStatus(input.reportRunId, context);

  const canonical = fromMetaStatus({
    async_status: result.status,
    async_percent_completion: result.asyncPercentCompletion,
  });

  return {
    ...canonical,
    reportRunId: result.reportRunId,
    rawStatus: result.status,
    isComplete: canonical.state === "complete",
    asyncPercentCompletion: result.asyncPercentCompletion,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    errorSubcode: result.errorSubcode,
    errorUserTitle: result.errorUserTitle,
    errorUserMsg: result.errorUserMsg,
    timestamp: new Date().toISOString(),
  };
}

export function checkReportStatusResponseFormatter(result: CheckReportStatusOutput): McpTextContent[] {
  const pct = result.asyncPercentCompletion != null ? ` (${result.asyncPercentCompletion}%)` : "";
  const failureDetail =
    result.state === "failed"
      ? [
          result.errorUserTitle,
          result.errorUserMsg ?? result.errorMessage,
          result.errorCode != null ? `code=${result.errorCode}` : undefined,
          result.errorSubcode != null ? `subcode=${result.errorSubcode}` : undefined,
        ]
          .filter(Boolean)
          .join(" | ")
      : "";
  const next = result.isComplete
    ? `\n\nReport complete — call \`meta_download_report\` with reportRunId: "${result.reportRunId}"`
    : result.state === "failed"
    ? `\n\nReport failed${failureDetail ? `: ${failureDetail}` : ""}. Submit a new report with \`meta_submit_report\`.`
    : `\n\nReport in progress${pct}. Poll again in ~10 seconds.`;

  return [
    {
      type: "text" as const,
      text: `Report ${result.reportRunId}: ${result.state} (${result.rawStatus})${next}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const checkReportStatusTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CheckReportStatusInputSchema,
  outputSchema: CheckReportStatusOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Check status of a submitted report",
      input: {
        reportRunId: "6082575495383",
      },
    },
  ],
  logic: checkReportStatusLogic,
  responseFormatter: checkReportStatusResponseFormatter,
};
