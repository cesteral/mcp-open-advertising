// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";
import { throwIfGraphqlErrors } from "../utils/graphql-errors.js";

const TOOL_NAME = "ttd_update_report_schedule";
const TOOL_TITLE = "Update TTD Report Schedule Status (GraphQL)";
const TOOL_DESCRIPTION = `Enable or disable a TTD report schedule via GraphQL (\`myReportsReportScheduleUpdate\`).

Use this to activate a disabled schedule or disable an active one without deleting it.

**Important:** Only the GraphQL API supports enabling/disabling schedules — the REST API cannot do this.

**Workflow:**
1. Use \`ttd_list_report_schedules\` to find the schedule ID and its current status
2. Call this tool with the schedule ID and the desired new status
3. Use \`ttd_get_report_schedule\` to confirm the status change

**Tips:**
- Set \`status: "DISABLED"\` to pause a schedule without losing its configuration
- Set \`status: "ACTIVE"\` to resume a previously disabled schedule
- To permanently remove a schedule, use \`ttd_delete_report_schedule\` instead`;

export const UpdateReportScheduleInputSchema = z
  .object({
    scheduleId: z.string().min(1).describe("ID of the report schedule to enable or disable"),
    status: z.enum(["ACTIVE", "DISABLED"]).describe("New status for the schedule"),
  })
  .describe("Parameters for updating a TTD report schedule status");

export const UpdateReportScheduleOutputSchema = z
  .object({
    scheduleId: z.string().describe("ID of the updated report schedule (echoed from input)"),
    status: z.string().optional().describe("New status returned by TTD after the update"),
    errors: z
      .array(z.object({ field: z.string().optional(), message: z.string() }))
      .optional()
      .describe("Mutation errors from TTD"),
    rawResponse: z.record(z.unknown()).optional(),
    timestamp: z.string().datetime(),
  })
  .describe("Result of report schedule status update");

type UpdateReportScheduleInput = z.infer<typeof UpdateReportScheduleInputSchema>;
type UpdateReportScheduleOutput = z.infer<typeof UpdateReportScheduleOutputSchema>;

const UPDATE_REPORT_SCHEDULE_MUTATION = `mutation UpdateReportSchedule($input: MyReportsReportScheduleUpdateInput!) {
  myReportsReportScheduleUpdate(input: $input) {
    data {
      status
    }
    errors {
      __typename
      ... on MutationError {
        field
        message
      }
    }
  }
}`;

export async function updateReportScheduleLogic(
  input: UpdateReportScheduleInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UpdateReportScheduleOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const variables = {
    input: {
      reportScheduleId: input.scheduleId,
      status: input.status,
    },
  };

  const raw = (await ttdService.graphqlQuery(
    UPDATE_REPORT_SCHEDULE_MUTATION,
    variables,
    context
  )) as Record<string, unknown>;

  throwIfGraphqlErrors(raw, "GraphQL error updating report schedule");

  const gqlData = (raw.data as Record<string, unknown> | undefined) ?? {};
  const mutationResult =
    (gqlData.myReportsReportScheduleUpdate as Record<string, unknown> | undefined) ?? {};
  const scheduleData = (mutationResult.data as Record<string, unknown> | undefined) ?? {};
  const errors = mutationResult.errors as Array<{ field?: string; message: string }> | undefined;

  return {
    scheduleId: input.scheduleId,
    status: scheduleData.status as string | undefined,
    errors: errors?.length ? errors : undefined,
    rawResponse: raw as Record<string, unknown>,
    timestamp: new Date().toISOString(),
  };
}

export function updateReportScheduleResponseFormatter(
  result: UpdateReportScheduleOutput
): McpTextContent[] {
  if (result.errors?.length) {
    return [
      {
        type: "text" as const,
        text:
          `Report schedule update failed:\n\n` +
          result.errors.map((e) => `- ${e.field ? `${e.field}: ` : ""}${e.message}`).join("\n") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  if (result.status) {
    return [
      {
        type: "text" as const,
        text:
          `Report schedule \`${result.scheduleId}\` is now \`${result.status}\`.\n\n` +
          `Use \`ttd_list_report_schedules\` to view all schedules.\n\n` +
          `Timestamp: ${result.timestamp}`,
      },
    ];
  }

  return [
    {
      type: "text" as const,
      text: `Report schedule update result:\n\n${JSON.stringify(result.rawResponse, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const updateReportScheduleTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UpdateReportScheduleInputSchema,
  outputSchema: UpdateReportScheduleOutputSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputExamples: [
    {
      label: "Disable an active report schedule",
      input: {
        scheduleId: "sched-abc123",
        status: "DISABLED",
      },
    },
    {
      label: "Re-enable a disabled report schedule",
      input: {
        scheduleId: "sched-abc123",
        status: "ACTIVE",
      },
    },
  ],
  logic: updateReportScheduleLogic,
  responseFormatter: updateReportScheduleResponseFormatter,
};
