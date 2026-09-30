// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import {
  McpError,
  JsonRpcErrorCode,
  assertGovernedEffectDryRun,
  EffectResultSchema,
  EffectDryRunResultSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  RequestContext,
  McpTextContent,
  SdkContext,
  EffectDryRunResult,
  DispatchedCapability,
  DryRunValidationError,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "msads_delete_report_schedule";
const TOOL_TITLE = "Delete Microsoft Ads Report Schedule";
const TOOL_DESCRIPTION = `NOT SUPPORTED — always fails without calling Microsoft Advertising. Nothing is deleted.

The Microsoft Advertising Reporting API v13 has no report schedules: it exposes only GenerateReport/Submit and GenerateReport/Poll, so there is no schedule to delete via the API, and msads_create_report_schedule never creates one.`;

/**
 * There is no Reporting v13 operation that deletes (or lists, or creates) a
 * report schedule — the `reporting-service` reference documents only
 * `GenerateReport/Submit` and `GenerateReport/Poll`. The tool used to log the
 * request and return "deletion requested", which read as a delete. It now
 * refuses every call so no caller (or governance record) can mistake it for
 * one.
 */
const NO_SCHEDULE_DELETE_MESSAGE =
  "Microsoft Advertising Reporting API v13 has no report schedules — it exposes only GenerateReport/Submit and GenerateReport/Poll, so there is nothing to delete via the API. Nothing was deleted.";

export const DeleteReportScheduleInputSchema = z
  .object({
    scheduleId: z.string().min(1).describe("Schedule ID returned by msads_create_report_schedule"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, returns an EffectDryRunResult under `dryRun` that always reports wouldSucceed: false (Microsoft Advertising has no report schedules). Never calls the Microsoft Ads API."
      ),
  })
  .describe("Parameters for deleting a Microsoft Ads report schedule");

export const DeleteReportScheduleOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    scheduleId: z.string(),
    note: z.string().optional().describe("Instructions for completing deletion"),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. Nothing was deleted."
    ),
    effect: EffectResultSchema.optional().describe(
      "Never emitted: every execute call fails, so nothing is ever deleted."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `delete_schedule` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Delete schedule response");

type DeleteReportScheduleInput = z.infer<typeof DeleteReportScheduleInputSchema>;
type DeleteReportScheduleOutput = z.infer<typeof DeleteReportScheduleOutputSchema>;

export async function deleteReportScheduleLogic(
  input: DeleteReportScheduleInput,
  _context: RequestContext,
  _sdkContext?: SdkContext
): Promise<DeleteReportScheduleOutput> {
  // Effect-class write: a report schedule is not a canonical ad entity, so there
  // is no entity snapshot. The capability is `delete_schedule` with a null kind.
  const dispatchedCapability: DispatchedCapability = {
    operation: "delete_schedule",
    canonicalEntityKind: null,
  };

  // Symbolic dry-run: validate the request. There is nothing to simulate — the
  // Microsoft Ads API cannot delete a schedule programmatically — so the
  // contract declares requiresSimulation: false and projects no expected effect.
  if (input.dry_run === true) {
    const dryRun = buildEffectDryRun(input);
    return {
      confirmed: true,
      scheduleId: input.scheduleId,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  // No confirmation prompt: there is nothing to confirm, because nothing can
  // be deleted. Refuse outright.
  throw new McpError(JsonRpcErrorCode.InvalidRequest, NO_SCHEDULE_DELETE_MESSAGE, {
    platform: "msads",
    tool: TOOL_NAME,
    unsupported: true,
    scheduleId: input.scheduleId,
  });
}

/**
 * Symbolic effect dry-run for `delete_report_schedule`. Always fails with an
 * UNSUPPORTED_OPERATION error (Microsoft Advertising has no report schedules);
 * the scheduleId check still runs. There is no effect to simulate: the
 * contract declares requiresSimulation: false and the dry-run carries no
 * expected effect. Pure (no I/O).
 */
function buildEffectDryRun(input: DeleteReportScheduleInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [
    { code: "UNSUPPORTED_OPERATION", message: NO_SCHEDULE_DELETE_MESSAGE, field: "scheduleId" },
  ];
  if (input.scheduleId.trim().length === 0) {
    validationErrors.push({
      code: "INVALID_SCHEDULE_ID",
      message: "scheduleId must be a non-empty report-schedule id",
      field: "scheduleId",
    });
  }

  return assertGovernedEffectDryRun(
    {
      wouldSucceed: false,
      validationErrors,
      validationSource: "symbolic",
      expectedEffectSource: "none",
    },
    TOOL_NAME,
    { requiresValidation: true, requiresSimulation: false }
  );
}

export function deleteReportScheduleResponseFormatter(
  result: DeleteReportScheduleOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource } = result.dryRun;
    const verdict = wouldSucceed ? "is well-formed" : "would FAIL";
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    return [
      {
        type: "text" as const,
        text:
          `Dry run: delete request for report schedule ${result.scheduleId} ${verdict} (validation: ${validationSource}). ` +
          `Microsoft Advertising has no report schedules, so nothing would be deleted.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Deletion of report schedule ${result.scheduleId} cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `${NO_SCHEDULE_DELETE_MESSAGE}\n\nTimestamp: ${result.timestamp}`,
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
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "msads",
      contractPlatformSlug: "msads",
      contractToolSlug: "delete_report_schedule",
      operation: ["delete_schedule"],
      // Effect-class: report schedules have no canonical ad-entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "msads.delete_report_schedule.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      // Honest contract booleans: scheduleId is validated symbolically, but
      // Microsoft Ads has no report schedules, so there is no effect to
      // simulate (requiresSimulation: false) and every execute call fails.
      requiresValidation: true,
      requiresSimulation: false,
    } satisfies CesteralWriteToolAnnotations,
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
