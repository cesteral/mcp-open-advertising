// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { fromMicrosoftStatus, ReportStatusSchema } from "@cesteral/shared";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_check_report_status";
const TOOL_TITLE = "Check Microsoft Ads Report Status";
const TOOL_DESCRIPTION = `Check the status of a previously submitted Microsoft Advertising report.

**Canonical states:** \`pending\`, \`running\`, \`complete\`, \`failed\`, \`cancelled\`.
Microsoft Ads raw statuses (Pending/InProgress/Success/Error) are mapped; the raw string is returned as \`rawStatus\`.
Returns the canonical state and download URL when the report is ready.`;

export const CheckReportStatusInputSchema = z
  .object({
    reportRequestId: z.string().describe("Report request ID from msads_submit_report"),
  })
  .describe("Parameters for checking report status");

export const CheckReportStatusOutputSchema = ReportStatusSchema.extend({
  reportRequestId: z.string(),
  rawStatus: z.string().describe("Raw Microsoft Ads status (Pending/InProgress/Success/Error)"),
  isComplete: z.boolean().describe("Whether the canonical state is 'complete'"),
  timestamp: z.string().datetime(),
}).describe("Report status result");

type CheckReportStatusInput = z.infer<typeof CheckReportStatusInputSchema>;
type CheckReportStatusOutput = z.infer<typeof CheckReportStatusOutputSchema>;

export async function checkReportStatusLogic(
  input: CheckReportStatusInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CheckReportStatusOutput> {
  const { msadsReportingService } = resolveSessionServices(sdkContext);

  const result = await msadsReportingService.checkReportStatus(input.reportRequestId, context);

  const canonical = fromMicrosoftStatus({
    ReportRequestStatus: result.status,
    ReportDownloadUrl: result.downloadUrl,
  });

  return {
    ...canonical,
    reportRequestId: input.reportRequestId,
    rawStatus: result.status,
    isComplete: canonical.state === "complete",
    timestamp: new Date().toISOString(),
  };
}

export function checkReportStatusResponseFormatter(
  result: CheckReportStatusOutput
): McpTextContent[] {
  let text = `Report ${result.reportRequestId} state: ${result.state} (${result.rawStatus})`;

  if (result.downloadUrl) {
    text += `\n\nDownload URL: ${result.downloadUrl}\n\nUse msads_download_report to download and parse the results.`;
  } else if (result.state === "running" || result.state === "pending") {
    text += "\n\nReport is still processing. Check again shortly.";
  }

  return [
    {
      type: "text" as const,
      text: `${text}\n\nTimestamp: ${result.timestamp}`,
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
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Check report status",
      input: { reportRequestId: "abc-123-def" },
    },
  ],
  logic: checkReportStatusLogic,
  responseFormatter: checkReportStatusResponseFormatter,
};
