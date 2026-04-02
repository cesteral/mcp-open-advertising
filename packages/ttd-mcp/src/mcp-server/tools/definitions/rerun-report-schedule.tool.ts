// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_rerun_report_schedule";
const TOOL_TITLE = "Rerun TTD Report Schedule Immediately (GraphQL)";
const TOOL_DESCRIPTION = `Immediately rerun a report from an existing TTD schedule via GraphQL (\`myReportsReportScheduleCreate\` with \`singleRunFromExistingScheduleInput\`).

Use this when a download link has expired or the report errored — it creates a fresh execution of an existing schedule without creating a new schedule.

**Important distinctions:**
- This tool triggers a **new single execution** of an existing schedule — it does not modify or replace the schedule
- The regenerated report uses the **most recent date range** (not the original run's dates)
- The \`scheduleId\` is the ID of an existing report schedule — use \`ttd_list_report_schedules\` to find schedule IDs
- To create a brand-new recurring schedule, use \`ttd_create_report_schedule\` instead

**Workflow:**
1. Identify the \`scheduleId\` of the schedule you want to rerun
2. Call this tool with the schedule ID
3. Use \`ttd_get_report_executions\` with the schedule ID to check execution status and retrieve the download link when complete`;

export const RerunReportScheduleInputSchema = z
  .object({
    scheduleId: z
      .string()
      .min(1)
      .describe("ID of the existing report schedule to rerun immediately"),
  })
  .describe("Parameters for immediately rerunning a TTD report schedule");

export const RerunReportScheduleOutputSchema = z
  .object({
    scheduleId: z.string().describe("Schedule ID echoed from input"),
    newExecutionData: z.unknown().optional().describe("The data scalar returned by TTD for the new execution"),
    errors: z
      .array(z.object({ field: z.string().optional(), message: z.string() }))
      .optional()
      .describe("Mutation errors from TTD"),
    rawResponse: z.record(z.unknown()).optional(),
    timestamp: z.string().datetime(),
  })
  .describe("Result of report schedule rerun");

type RerunReportScheduleInput = z.infer<typeof RerunReportScheduleInputSchema>;
type RerunReportScheduleOutput = z.infer<typeof RerunReportScheduleOutputSchema>;

const RERUN_REPORT_SCHEDULE_MUTATION = `mutation RerunReportSchedule($input: MyReportsReportScheduleCreateInput!) {
  myReportsReportScheduleCreate(input: $input) {
    data {
      id
      name
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

export async function rerunReportScheduleLogic(
  input: RerunReportScheduleInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<RerunReportScheduleOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const variables = {
    input: {
      singleRunFromExistingScheduleInput: {
        id: input.scheduleId,
      },
    },
  };

  const raw = (await ttdService.graphqlQuery(
    RERUN_REPORT_SCHEDULE_MUTATION,
    variables,
    context
  )) as Record<string, unknown>;

  const gqlData = (raw.data as Record<string, unknown> | undefined) ?? {};
  const mutationResult =
    (gqlData.myReportsReportScheduleCreate as Record<string, unknown> | undefined) ?? {};
  const errors = mutationResult.errors as
    | Array<{ field?: string; message: string }>
    | undefined;

  return {
    scheduleId: input.scheduleId,
    newExecutionData: mutationResult.data as Record<string, unknown> | undefined,
    errors: errors?.length ? errors : undefined,
    rawResponse: raw as Record<string, unknown>,
    timestamp: new Date().toISOString(),
  };
}

export function rerunReportScheduleResponseFormatter(
  result: RerunReportScheduleOutput
): McpTextContent[] {
  if (result.errors?.length) {
    return [
      {
        type: "text" as const,
        text:
          `Report schedule rerun failed:\n\n` +
          result.errors
            .map((e) => `- ${e.field ? `${e.field}: ` : ""}${e.message}`)
            .join("\n") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  if (result.newExecutionData !== undefined && result.newExecutionData !== null) {
    return [
      {
        type: "text" as const,
        text:
          `Report schedule \`${result.scheduleId}\` triggered successfully. A new execution has been queued.\n\n` +
          `Use \`ttd_get_report_executions\` with schedule ID \`${result.scheduleId}\` to check status and retrieve the download link when complete.\n\n` +
          `Timestamp: ${result.timestamp}`,
      },
    ];
  }

  return [
    {
      type: "text" as const,
      text: `Report schedule rerun result:\n\n${JSON.stringify(result.rawResponse, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const rerunReportScheduleTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: RerunReportScheduleInputSchema,
  outputSchema: RerunReportScheduleOutputSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputExamples: [
    {
      label: "Rerun an existing report schedule immediately",
      input: {
        scheduleId: "sched-abc123",
      },
    },
  ],
  logic: rerunReportScheduleLogic,
  responseFormatter: rerunReportScheduleResponseFormatter,
};
