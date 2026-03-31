// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_delete_report_schedule";
const TOOL_TITLE = "Delete TTD Report Schedule";
const TOOL_DESCRIPTION = `Permanently delete a TTD report schedule.

**This action is irreversible.** The schedule and any pending executions will be removed.
Active or completed report executions are not affected — only the schedule definition is deleted.

Use \`ttd_list_report_schedules\` to find the schedule ID.`;

export const DeleteReportScheduleInputSchema = z
  .object({
    scheduleId: z
      .string()
      .min(1)
      .describe("Report schedule ID to delete"),
  })
  .describe("Parameters for deleting a TTD report schedule");

export const DeleteReportScheduleOutputSchema = z
  .object({
    scheduleId: z.string().describe("ID of the deleted schedule"),
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
  const { ttdReportingService } = resolveSessionServices(sdkContext);

  await ttdReportingService.deleteReportSchedule(input.scheduleId, context);

  return {
    scheduleId: input.scheduleId,
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
      text: `Report schedule deleted: ${result.scheduleId}\n\nTimestamp: ${result.timestamp}`,
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
      label: "Delete a report schedule",
      input: {
        scheduleId: "abc123-def456",
      },
    },
  ],
  logic: deleteReportScheduleLogic,
  responseFormatter: deleteReportScheduleResponseFormatter,
};
