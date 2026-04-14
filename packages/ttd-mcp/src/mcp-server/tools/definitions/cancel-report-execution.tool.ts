// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";
import { throwIfGraphqlErrors } from "../utils/graphql-errors.js";

const TOOL_NAME = "ttd_cancel_report_execution";
const TOOL_TITLE = "Cancel TTD Report Execution (GraphQL)";
const TOOL_DESCRIPTION = `Cancel an in-progress TTD report execution via GraphQL (\`myReportsReportExecutionCancel\`).

Use this to stop a report that is currently generating. Only reports in the \`IN_PROGRESS\` state can be cancelled.

**Important distinctions:**
- This tool cancels a **report execution** (an in-progress run), not a report schedule
- The \`executionId\` is distinct from a schedule ID — use \`ttd_list_report_schedules\` or execution history to find execution IDs
- To delete a schedule entirely, use \`ttd_delete_report_schedule\` instead
- Cancelled report executions remain accessible; only the generation process is stopped

**Workflow:**
1. Identify the \`executionId\` of the in-progress report you want to cancel
2. Call this tool with the execution ID
3. Check \`isCancelled\` in the response to confirm the cancellation succeeded`;

export const CancelReportExecutionInputSchema = z
  .object({
    executionId: z
      .string()
      .min(1)
      .describe("Execution ID of the in-progress report to cancel"),
  })
  .describe("Parameters for cancelling a TTD report execution");

export const CancelReportExecutionOutputSchema = z
  .object({
    executionId: z.string().describe("Execution ID echoed from input"),
    isCancelled: z.boolean().optional().describe("Whether the execution was successfully cancelled"),
    errors: z
      .array(z.object({ field: z.string().optional(), message: z.string() }))
      .optional()
      .describe("Mutation errors from TTD"),
    rawResponse: z.record(z.unknown()).optional(),
    timestamp: z.string().datetime(),
  })
  .describe("Result of report execution cancellation");

type CancelReportExecutionInput = z.infer<typeof CancelReportExecutionInputSchema>;
type CancelReportExecutionOutput = z.infer<typeof CancelReportExecutionOutputSchema>;

const CANCEL_REPORT_EXECUTION_MUTATION = `mutation CancelReportExecution($input: MyReportsReportExecutionCancelInput!) {
  myReportsReportExecutionCancel(input: $input) {
    data {
      isCancelled
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

export async function cancelReportExecutionLogic(
  input: CancelReportExecutionInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CancelReportExecutionOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const variables = {
    input: {
      executionId: input.executionId,
    },
  };

  const raw = (await ttdService.graphqlQuery(
    CANCEL_REPORT_EXECUTION_MUTATION,
    variables,
    context
  )) as Record<string, unknown>;

  throwIfGraphqlErrors(raw, "GraphQL error cancelling report execution");

  const gqlData = (raw.data as Record<string, unknown> | undefined) ?? {};
  const mutationResult =
    (gqlData.myReportsReportExecutionCancel as Record<string, unknown> | undefined) ?? {};
  const executionData = (mutationResult.data as Record<string, unknown> | undefined) ?? {};
  const errors = mutationResult.errors as
    | Array<{ field?: string; message: string }>
    | undefined;

  return {
    executionId: input.executionId,
    isCancelled: executionData.isCancelled as boolean | undefined,
    errors: errors?.length ? errors : undefined,
    rawResponse: raw as Record<string, unknown>,
    timestamp: new Date().toISOString(),
  };
}

export function cancelReportExecutionResponseFormatter(
  result: CancelReportExecutionOutput
): McpTextContent[] {
  if (result.errors?.length) {
    return [
      {
        type: "text" as const,
        text:
          `Report execution cancellation failed:\n\n` +
          result.errors
            .map((e) => `- ${e.field ? `${e.field}: ` : ""}${e.message}`)
            .join("\n") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  if (result.isCancelled === true) {
    return [
      {
        type: "text" as const,
        text:
          `Report execution \`${result.executionId}\` was successfully cancelled.\n\n` +
          `Timestamp: ${result.timestamp}`,
      },
    ];
  }

  if (result.isCancelled === false) {
    return [
      {
        type: "text" as const,
        text:
          `Report execution \`${result.executionId}\` could not be cancelled (may have already completed or been cancelled).\n\n` +
          `Timestamp: ${result.timestamp}`,
      },
    ];
  }

  return [
    {
      type: "text" as const,
      text: `Report execution cancellation result:\n\n${JSON.stringify(result.rawResponse, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const cancelReportExecutionTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CancelReportExecutionInputSchema,
  outputSchema: CancelReportExecutionOutputSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputExamples: [
    {
      label: "Cancel an in-progress report execution",
      input: {
        executionId: "exec-abc123",
      },
    },
  ],
  logic: cancelReportExecutionLogic,
  responseFormatter: cancelReportExecutionResponseFormatter,
};
