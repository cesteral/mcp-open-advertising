// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { fromTtdStatus, ReportStatusSchema } from "@cesteral/shared";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_check_report_status";
const TOOL_TITLE = "Check TTD Report Status";
const TOOL_DESCRIPTION = `Check the status of a previously submitted TTD report.

Makes a single API call to check execution state. Does not poll or wait.

**States** (canonical): \`pending\`, \`running\`, \`complete\`, \`failed\`, \`cancelled\`
- If \`complete\` with a \`downloadUrl\`, use \`ttd_download_report\` to fetch results.
- If not complete, call this tool again in 5-10 seconds.`;

export const CheckReportStatusInputSchema = z
  .object({
    reportScheduleId: z
      .string()
      .min(1)
      .describe("Report schedule ID from ttd_submit_report"),
  })
  .describe("Parameters for checking TTD report status");

export const CheckReportStatusOutputSchema = ReportStatusSchema.extend({
  reportScheduleId: z.string().describe("Report schedule ID"),
  isComplete: z.boolean().describe("Whether the report is complete"),
  execution: z.record(z.any()).describe("Full execution details"),
  timestamp: z.string().datetime(),
}).describe("Report status check result");

type CheckReportStatusInput = z.infer<typeof CheckReportStatusInputSchema>;
type CheckReportStatusOutput = z.infer<typeof CheckReportStatusOutputSchema>;

export async function checkReportStatusLogic(
  input: CheckReportStatusInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CheckReportStatusOutput> {
  const { ttdReportingService } = resolveSessionServices(sdkContext);

  const result = await ttdReportingService.checkReportExecution(
    input.reportScheduleId,
    context
  );

  const canonical = fromTtdStatus({
    ExecutionState: result.state,
    ReportDownloadUrl: result.downloadUrl,
  });

  return {
    ...canonical,
    reportScheduleId: result.reportScheduleId,
    isComplete: canonical.state === "complete",
    execution: result.execution,
    timestamp: new Date().toISOString(),
  };
}

export function checkReportStatusResponseFormatter(result: CheckReportStatusOutput): McpTextContent[] {
  if (result.isComplete && result.downloadUrl) {
    return [
      {
        type: "text" as const,
        text: `Report complete: ${result.reportScheduleId}\n\nDownload URL: ${result.downloadUrl}\n\nUse \`ttd_download_report\` with this URL to fetch a bounded summary or paged row slice.\n\nExecution details:\n${JSON.stringify(result.execution, null, 2)}\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  if (result.isComplete) {
    return [
      {
        type: "text" as const,
        text: `Report complete: ${result.reportScheduleId}\n\nNo download URL available.\n\nExecution details:\n${JSON.stringify(result.execution, null, 2)}\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  if (result.state === "failed") {
    return [
      {
        type: "text" as const,
        text: `Report failed: ${result.reportScheduleId}\n\nExecution details:\n${JSON.stringify(result.execution, null, 2)}\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  return [
    {
      type: "text" as const,
      text: `Report in progress: ${result.reportScheduleId}\nState: ${result.state}\n\nCall \`ttd_check_report_status\` again in 5-10 seconds.\n\nTimestamp: ${result.timestamp}`,
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
      label: "Check report status",
      input: {
        reportScheduleId: "abc123-def456",
      },
    },
  ],
  logic: checkReportStatusLogic,
  responseFormatter: checkReportStatusResponseFormatter,
};
