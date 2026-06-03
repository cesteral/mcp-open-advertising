// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  assertGovernedEffectDryRun,
  EffectResultSchema,
  EffectDryRunResultSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  McpTextContent,
  RequestContext,
  SdkContext,
  EffectResult,
  EffectDryRunResult,
  DispatchedCapability,
  DryRunValidationError,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";
import { throwIfGraphqlErrors } from "../utils/graphql-errors.js";

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

const EFFECT_KIND = "report_requested";

export const RerunReportScheduleInputSchema = z
  .object({
    scheduleId: z
      .string()
      .min(1)
      .describe("ID of the existing report schedule to rerun immediately"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be report rerun) without calling the TTD API. No execution is queued."
      ),
  })
  .describe("Parameters for immediately rerunning a TTD report schedule");

export const RerunReportScheduleOutputSchema = z
  .object({
    scheduleId: z.string().describe("Schedule ID echoed from input"),
    newExecutionData: z
      .unknown()
      .optional()
      .describe("The data scalar returned by TTD for the new execution"),
    errors: z
      .array(z.object({ field: z.string().optional(), message: z.string() }))
      .optional()
      .describe("Mutation errors from TTD"),
    rawResponse: z.record(z.unknown()).optional(),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No execution was queued."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `report_requested` + scalar audit summary). Present only when the mutation actually queued a new execution. Effect writes carry no canonical entity snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `submit_report` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Result of report schedule rerun");

type RerunReportScheduleInput = z.infer<typeof RerunReportScheduleInputSchema>;
type RerunReportScheduleOutput = z.infer<typeof RerunReportScheduleOutputSchema>;

const RERUN_REPORT_SCHEDULE_MUTATION = `mutation RerunReportSchedule($input: MyReportsReportScheduleCreateInput!) {
  myReportsReportScheduleCreate(input: $input) {
    data {
      id
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
  // Effect-class write: queuing a new execution has no canonical ad-entity
  // snapshot. The capability is `submit_report` with a null entity kind.
  const dispatchedCapability: DispatchedCapability = {
    operation: "submit_report",
    canonicalEntityKind: null,
  };

  // Symbolic dry-run: validate the request and project the would-be effect. No
  // API call.
  if (input.dry_run === true) {
    const dryRun = buildEffectDryRun(input);
    return {
      scheduleId: input.scheduleId,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

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

  throwIfGraphqlErrors(raw, "GraphQL error rerunning report schedule");

  const gqlData = (raw.data as Record<string, unknown> | undefined) ?? {};
  const mutationResult =
    (gqlData.myReportsReportScheduleCreate as Record<string, unknown> | undefined) ?? {};
  const errors = mutationResult.errors as Array<{ field?: string; message: string }> | undefined;
  const newExecutionData = mutationResult.data as Record<string, unknown> | undefined;

  // Effect emitted only when the mutation actually queued a new execution (data
  // scalar present, no errors). The summary uses stable scalar identities only.
  const executionQueued =
    newExecutionData !== undefined && newExecutionData !== null && !errors?.length;
  const executionId = newExecutionData?.id as string | undefined;
  const effect: EffectResult | undefined = executionQueued
    ? {
        effectKind: EFFECT_KIND,
        summary: {
          schedule_id: input.scheduleId,
          ...(executionId !== undefined && { report_handle: executionId }),
        },
      }
    : undefined;

  return {
    scheduleId: input.scheduleId,
    newExecutionData,
    errors: errors?.length ? errors : undefined,
    rawResponse: raw as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `rerun_report_schedule`. TTD GraphQL has no native
 * validate/preview, so both axes are symbolic. Validates the schedule id is
 * non-empty and projects the scalar would-be effect (a fresh report run). Pure
 * (no I/O).
 */
function buildEffectDryRun(input: RerunReportScheduleInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  if (input.scheduleId.trim().length === 0) {
    validationErrors.push({
      code: "INVALID_SCHEDULE_ID",
      message: "scheduleId must be a non-empty report-schedule id",
      field: "scheduleId",
    });
  }

  const expectedEffect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: { schedule_id: input.scheduleId },
  };

  return assertGovernedEffectDryRun(
    {
      wouldSucceed: validationErrors.length === 0,
      validationErrors,
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect,
    },
    TOOL_NAME,
    { requiresValidation: true, requiresSimulation: true }
  );
}

export function rerunReportScheduleResponseFormatter(
  result: RerunReportScheduleOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedEffectSource } =
      result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    return [
      {
        type: "text" as const,
        text:
          `Dry run: rerunning report schedule ${result.scheduleId} ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No execution was queued.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  if (result.errors?.length) {
    return [
      {
        type: "text" as const,
        text:
          `Report schedule rerun failed:\n\n` +
          result.errors.map((e) => `- ${e.field ? `${e.field}: ` : ""}${e.message}`).join("\n") +
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
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "ttd",
      contractPlatformSlug: "ttd",
      contractToolSlug: "rerun_report_schedule",
      operation: ["submit_report"],
      // Effect-class: queuing a report run has no canonical ad-entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "ttd.rerun_report_schedule.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
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
