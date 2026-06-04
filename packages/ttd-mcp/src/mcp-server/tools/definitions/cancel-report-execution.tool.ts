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

const EFFECT_KIND = "report_execution_cancelled";

export const CancelReportExecutionInputSchema = z
  .object({
    executionId: z.string().min(1).describe("Execution ID of the in-progress report to cancel"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be cancellation) without calling the TTD API. Nothing is cancelled."
      ),
  })
  .describe("Parameters for cancelling a TTD report execution");

export const CancelReportExecutionOutputSchema = z
  .object({
    executionId: z.string().describe("Execution ID echoed from input"),
    isCancelled: z
      .boolean()
      .optional()
      .describe("Whether the execution was successfully cancelled"),
    errors: z
      .array(z.object({ field: z.string().optional(), message: z.string() }))
      .optional()
      .describe("Mutation errors from TTD"),
    rawResponse: z.record(z.unknown()).optional(),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. Nothing was cancelled."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `report_execution_cancelled` + scalar audit summary). Present ONLY when `isCancelled === true` — a `false`/unknown outcome (already completed, not cancellable) emits no effect. Effect writes carry no canonical entity snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `manage` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
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
  // Effect-class write: cancelling an execution has no canonical ad-entity
  // snapshot. The capability is `manage` with a null entity kind.
  const dispatchedCapability: DispatchedCapability = {
    operation: "manage",
    canonicalEntityKind: null,
  };

  // Symbolic dry-run: validate the request and project the would-be effect. No
  // API call.
  if (input.dry_run === true) {
    const dryRun = buildEffectDryRun(input);
    return {
      executionId: input.executionId,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

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
  const errors = mutationResult.errors as Array<{ field?: string; message: string }> | undefined;
  const isCancelled = executionData.isCancelled as boolean | undefined;

  // Effect emitted ONLY when the execution was actually cancelled (isCancelled
  // === true). A `false` or unknown outcome (already completed, not cancellable)
  // is not a completed cancellation — emitting an effect would record a
  // governance action that did not happen.
  const effect: EffectResult | undefined =
    isCancelled === true
      ? {
          effectKind: EFFECT_KIND,
          summary: { execution_id: input.executionId },
        }
      : undefined;

  return {
    executionId: input.executionId,
    isCancelled,
    errors: errors?.length ? errors : undefined,
    rawResponse: raw as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `cancel_report_execution`. TTD GraphQL has no
 * native validate/preview, so both axes are symbolic. Validates the execution id
 * is non-empty and projects the scalar would-be effect (the intended
 * cancellation). The execute path still gates the emitted effect on the actual
 * `isCancelled === true` outcome. Pure (no I/O).
 */
function buildEffectDryRun(input: CancelReportExecutionInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  if (input.executionId.trim().length === 0) {
    validationErrors.push({
      code: "INVALID_EXECUTION_ID",
      message: "executionId must be a non-empty report-execution id",
      field: "executionId",
    });
  }

  const expectedEffect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: { execution_id: input.executionId },
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

export function cancelReportExecutionResponseFormatter(
  result: CancelReportExecutionOutput
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
          `Dry run: cancelling report execution ${result.executionId} ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). Nothing was cancelled.` +
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
          `Report execution cancellation failed:\n\n` +
          result.errors.map((e) => `- ${e.field ? `${e.field}: ` : ""}${e.message}`).join("\n") +
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
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "ttd",
      contractPlatformSlug: "ttd",
      contractToolSlug: "cancel_report_execution",
      operation: ["manage"],
      // Effect-class: cancelling an execution has no canonical ad-entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "ttd.cancel_report_execution.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
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
