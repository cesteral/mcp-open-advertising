// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "meta_check_report_status";
const TOOL_TITLE = "Check Meta Report Status";
const TOOL_DESCRIPTION = `Check the status of an async Meta Ads insights report job.

Poll this tool after \`meta_submit_report\` until \`isComplete\` is true, then call \`meta_download_report\`.

**Status values:** "Job Not Started", "Job Started", "Job Running", "Job Succeeded", "Job Failed"`;

export const CheckReportStatusInputSchema = z
  .object({
    reportRunId: z
      .string()
      .min(1)
      .describe("Report run ID from meta_submit_report"),
  })
  .describe("Parameters for checking a Meta report status");

export const CheckReportStatusOutputSchema = z
  .object({
    reportRunId: z.string(),
    status: z.string().describe("Job status: Job Not Started, Job Started, Job Running, Job Succeeded, Job Failed"),
    isComplete: z.boolean().describe("True when status is 'Job Succeeded' — safe to call meta_download_report"),
    asyncPercentCompletion: z.number().optional().describe("Completion percentage (0–100)"),
    timestamp: z.string().datetime(),
  })
  .describe("Report status check result");

type CheckReportStatusInput = z.infer<typeof CheckReportStatusInputSchema>;
type CheckReportStatusOutput = z.infer<typeof CheckReportStatusOutputSchema>;

export async function checkReportStatusLogic(
  input: CheckReportStatusInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CheckReportStatusOutput> {
  const { metaInsightsService } = resolveSessionServices(sdkContext);

  const result = await metaInsightsService.checkReportStatus(input.reportRunId, context);

  return {
    reportRunId: result.reportRunId,
    status: result.status,
    isComplete: result.status === "Job Succeeded",
    asyncPercentCompletion: result.asyncPercentCompletion,
    timestamp: new Date().toISOString(),
  };
}

export function checkReportStatusResponseFormatter(result: CheckReportStatusOutput): McpTextContent[] {
  const pct = result.asyncPercentCompletion != null ? ` (${result.asyncPercentCompletion}%)` : "";
  const next = result.isComplete
    ? `\n\nReport complete — call \`meta_download_report\` with reportRunId: "${result.reportRunId}"`
    : result.status === "Job Failed"
    ? `\n\nReport failed. Submit a new report with \`meta_submit_report\`.`
    : `\n\nReport in progress${pct}. Poll again in ~10 seconds.`;

  return [
    {
      type: "text" as const,
      text: `Report ${result.reportRunId}: ${result.status}${next}\n\nTimestamp: ${result.timestamp}`,
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
