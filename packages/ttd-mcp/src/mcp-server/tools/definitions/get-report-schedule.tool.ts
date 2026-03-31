// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_get_report_schedule";
const TOOL_TITLE = "Get TTD Report Schedule";
const TOOL_DESCRIPTION = `Get full details for a specific TTD report schedule by ID.

Returns the complete schedule configuration including dimensions, metrics, filters,
schedule type, and date range settings.

Use \`ttd_list_report_schedules\` to discover schedule IDs.`;

export const GetReportScheduleInputSchema = z
  .object({
    scheduleId: z
      .string()
      .min(1)
      .describe("Report schedule ID to retrieve"),
  })
  .describe("Parameters for getting a TTD report schedule");

export const GetReportScheduleOutputSchema = z
  .object({
    schedule: z.record(z.unknown()).describe("Full report schedule details"),
    timestamp: z.string().datetime(),
  })
  .describe("Report schedule details");

type GetReportScheduleInput = z.infer<typeof GetReportScheduleInputSchema>;
type GetReportScheduleOutput = z.infer<typeof GetReportScheduleOutputSchema>;

export async function getReportScheduleLogic(
  input: GetReportScheduleInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetReportScheduleOutput> {
  const { ttdReportingService } = resolveSessionServices(sdkContext);

  const schedule = (await ttdReportingService.getReportSchedule(
    input.scheduleId,
    context
  )) as Record<string, unknown>;

  return {
    schedule,
    timestamp: new Date().toISOString(),
  };
}

export function getReportScheduleResponseFormatter(
  result: GetReportScheduleOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Report schedule details:\n\n${JSON.stringify(result.schedule, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getReportScheduleTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetReportScheduleInputSchema,
  outputSchema: GetReportScheduleOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Get a report schedule",
      input: {
        scheduleId: "abc123-def456",
      },
    },
  ],
  logic: getReportScheduleLogic,
  responseFormatter: getReportScheduleResponseFormatter,
};
