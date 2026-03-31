// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_delete_report_schedule";
const TOOL_TITLE = "Delete Microsoft Ads Report Schedule";
const TOOL_DESCRIPTION = `Delete (cancel) a Microsoft Advertising report schedule.

Note: The Microsoft Advertising REST API v13 does not provide a programmatic endpoint to cancel or delete scheduled reports. Deletion must be performed via the Microsoft Advertising UI at app.ads.microsoft.com → Reports → Scheduled Reports.

This tool logs the deletion request and returns instructions for manual removal.`;

export const DeleteReportScheduleInputSchema = z
  .object({
    scheduleId: z
      .string()
      .min(1)
      .describe("Schedule ID returned by msads_create_report_schedule"),
  })
  .describe("Parameters for deleting a Microsoft Ads report schedule");

export const DeleteReportScheduleOutputSchema = z
  .object({
    scheduleId: z.string(),
    note: z.string().describe("Instructions for completing deletion"),
    timestamp: z.string().datetime(),
  })
  .describe("Delete schedule response");

type DeleteReportScheduleInput = z.infer<typeof DeleteReportScheduleInputSchema>;
type DeleteReportScheduleOutput = z.infer<typeof DeleteReportScheduleOutputSchema>;

export async function deleteReportScheduleLogic(
  input: DeleteReportScheduleInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DeleteReportScheduleOutput> {
  const { msadsReportingService } = resolveSessionServices(sdkContext);

  await msadsReportingService.deleteReportSchedule(input.scheduleId, context);

  return {
    scheduleId: input.scheduleId,
    note: `To delete schedule ${input.scheduleId}: visit app.ads.microsoft.com → Reports → Scheduled Reports and remove the report manually. The Microsoft Advertising REST API does not provide a programmatic delete endpoint.`,
    timestamp: new Date().toISOString(),
  };
}

export function deleteReportScheduleResponseFormatter(result: DeleteReportScheduleOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Schedule ${result.scheduleId} deletion requested.\n\n${result.note}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const deleteReportScheduleTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: DeleteReportScheduleInputSchema,
  outputSchema: DeleteReportScheduleOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Delete a scheduled report",
      input: {
        scheduleId: "abc123def456",
      },
    },
  ],
  logic: deleteReportScheduleLogic,
  responseFormatter: deleteReportScheduleResponseFormatter,
};
