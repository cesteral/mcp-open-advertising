// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { fromAmazonDspStatus, ReportStatusSchema } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "amazon_dsp_check_report_status";
const TOOL_TITLE = "Check Amazon DSP Report Status";
const TOOL_DESCRIPTION = `Check the status of a previously submitted Amazon DSP report task.

Makes a single API call to check task status. Does not poll or wait.

**Canonical states:** \`pending\`, \`running\`, \`complete\`, \`failed\`, \`cancelled\`.
Amazon DSP raw statuses (PENDING/PROCESSING/COMPLETED/FAILED) are mapped; the raw string is returned as \`rawStatus\`.
- If state is \`complete\` with a \`downloadUrl\`, use \`amazon_dsp_download_report\` to fetch results.
- If not done, call this tool again in ~10 seconds.`;

export const CheckReportStatusInputSchema = z
  .object({
    accountId: z
      .string()
      .min(1)
      .describe("Amazon DSP account (entity) ID used in the reporting URL path"),
    taskId: z
      .string()
      .min(1)
      .describe("Report task ID from amazon_dsp_submit_report"),
  })
  .describe("Parameters for checking Amazon DSP report status");

export const CheckReportStatusOutputSchema = ReportStatusSchema.extend({
  taskId: z.string().describe("Report task ID"),
  rawStatus: z.string().describe("Raw Amazon DSP status (PENDING/PROCESSING/COMPLETED/FAILED)"),
  isComplete: z.boolean().describe("Whether the canonical state is 'complete'"),
  timestamp: z.string().datetime(),
}).describe("Report status check result");

type CheckReportStatusInput = z.infer<typeof CheckReportStatusInputSchema>;
type CheckReportStatusOutput = z.infer<typeof CheckReportStatusOutputSchema>;

export async function checkReportStatusLogic(
  input: CheckReportStatusInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CheckReportStatusOutput> {
  const { amazonDspReportingService } = resolveSessionServices(sdkContext);

  const result = await amazonDspReportingService.checkReportStatus(
    input.accountId,
    input.taskId,
    context
  );

  const canonical = fromAmazonDspStatus({
    status: result.status,
    downloadUrl: result.downloadUrl,
  });

  return {
    ...canonical,
    taskId: result.taskId,
    rawStatus: result.status,
    isComplete: canonical.state === "complete",
    timestamp: new Date().toISOString(),
  };
}

export function checkReportStatusResponseFormatter(result: CheckReportStatusOutput): McpTextContent[] {
  if (result.isComplete && result.downloadUrl) {
    return [
      {
        type: "text" as const,
        text: `Report complete: ${result.taskId}\n\nDownload URL: ${result.downloadUrl}\n\nUse \`amazon_dsp_download_report\` with this URL to fetch and parse the report data.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  if (result.state === "failed") {
    return [
      {
        type: "text" as const,
        text: `Report failed: ${result.taskId}\n\nThe report task failed. Check the report configuration and try again.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  return [
    {
      type: "text" as const,
      text: `Report in progress: ${result.taskId}\nState: ${result.state} (${result.rawStatus})\n\nCall \`amazon_dsp_check_report_status\` again in ~10 seconds.\n\nTimestamp: ${result.timestamp}`,
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
      label: "Check report task status",
      input: {
        accountId: "1234567890",
        taskId: "rpt-abc123",
      },
    },
  ],
  logic: checkReportStatusLogic,
  responseFormatter: checkReportStatusResponseFormatter,
};