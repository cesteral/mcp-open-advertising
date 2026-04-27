// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "cm360_delete_report_schedule";
const TOOL_TITLE = "Delete CM360 Report Schedule";
const TOOL_DESCRIPTION = `Delete a CM360 scheduled report (and its schedule).

This permanently deletes the report resource. Use cm360_list_report_schedules to find the reportId.`;

export const DeleteReportScheduleInputSchema = z
  .object({
    profileId: z.string().min(1).describe("CM360 User Profile ID"),
    reportId: z
      .string()
      .min(1)
      .describe(
        "Report ID to delete (from cm360_create_report_schedule or cm360_list_report_schedules)"
      ),
  })
  .describe("Parameters for deleting a CM360 report schedule");

export const DeleteReportScheduleOutputSchema = z
  .object({
    reportId: z.string(),
    deleted: z.literal(true),
    timestamp: z.string().datetime(),
  })
  .describe("Deletion confirmation");

type DeleteReportScheduleInput = z.infer<typeof DeleteReportScheduleInputSchema>;
type DeleteReportScheduleOutput = z.infer<typeof DeleteReportScheduleOutputSchema>;

export async function deleteReportScheduleLogic(
  input: DeleteReportScheduleInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DeleteReportScheduleOutput> {
  const { cm360ReportingService } = resolveSessionServices(sdkContext);

  await cm360ReportingService.deleteReportSchedule(input.profileId, input.reportId, context);

  return {
    reportId: input.reportId,
    deleted: true,
    timestamp: new Date().toISOString(),
  };
}

export function deleteReportScheduleResponseFormatter(
  result: DeleteReportScheduleOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Report ${result.reportId} deleted successfully.\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: true,
    destructiveHint: true,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Delete a scheduled report",
      input: {
        profileId: "123456",
        reportId: "789012345",
      },
    },
  ],
  logic: deleteReportScheduleLogic,
  responseFormatter: deleteReportScheduleResponseFormatter,
};
