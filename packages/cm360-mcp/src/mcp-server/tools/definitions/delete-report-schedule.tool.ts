// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  elicitDeleteConfirmation,
  assertGovernedEffectDryRun,
  EffectResultSchema,
  EffectDryRunResultSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  RequestContext,
  McpTextContent,
  SdkContext,
  EffectResult,
  EffectDryRunResult,
  DispatchedCapability,
  DryRunValidationError,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "cm360_delete_report_schedule";
const TOOL_TITLE = "Delete CM360 Report Schedule";
const TOOL_DESCRIPTION = `Delete a CM360 scheduled report (and its schedule).

This permanently deletes the report resource. Use cm360_list_report_schedules to find the reportId.`;

const EFFECT_KIND = "report_schedule_deleted";
const ENTITY_LABEL = "report_schedule";

export const DeleteReportScheduleInputSchema = z
  .object({
    profileId: z.string().min(1).describe("CM360 User Profile ID"),
    reportId: z
      .string()
      .min(1)
      .describe(
        "Report ID to delete (from cm360_create_report_schedule or cm360_list_report_schedules)"
      ),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be schedule deletion) without prompting for confirmation or calling the CM360 API. Nothing is deleted."
      ),
  })
  .describe("Parameters for deleting a CM360 report schedule");

export const DeleteReportScheduleOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    reportId: z.string(),
    deleted: z.boolean(),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. Nothing was deleted."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `report_schedule_deleted` + scalar audit summary). Present on a confirmed execute. Effect writes carry no canonical entity snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `delete_schedule` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Deletion confirmation");

type DeleteReportScheduleInput = z.infer<typeof DeleteReportScheduleInputSchema>;
type DeleteReportScheduleOutput = z.infer<typeof DeleteReportScheduleOutputSchema>;

export async function deleteReportScheduleLogic(
  input: DeleteReportScheduleInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DeleteReportScheduleOutput> {
  // Effect-class write: a report schedule is not a canonical ad entity, so there
  // is no entity snapshot. The capability is `delete_schedule` with a null kind.
  const dispatchedCapability: DispatchedCapability = {
    operation: "delete_schedule",
    canonicalEntityKind: null,
  };

  // Symbolic dry-run: validate the request and project the would-be effect
  // (a report-schedule deletion). No confirmation prompt, no API call.
  if (input.dry_run === true) {
    const dryRun = buildEffectDryRun(input);
    return {
      confirmed: true,
      reportId: input.reportId,
      deleted: false,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const confirmed = await elicitDeleteConfirmation({
    entityLabel: "report schedule",
    entityId: input.reportId,
    sdkContext,
  });
  if (!confirmed) {
    return {
      confirmed: false,
      declineReason: "user_declined",
      reportId: input.reportId,
      deleted: false,
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  const { cm360ReportingService } = resolveSessionServices(sdkContext);

  await cm360ReportingService.deleteReportSchedule(input.profileId, input.reportId, context);

  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: { entity_label: ENTITY_LABEL, schedule_handle: input.reportId },
  };

  return {
    confirmed: true,
    reportId: input.reportId,
    deleted: true,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `delete_report_schedule`. Validates the request
 * (reportId non-empty — guards against whitespace-only ids Zod's `.min(1)`
 * admits) and projects the would-be effect (a report-schedule deletion). CM360
 * has no native validate/preview, so both axes are symbolic. Pure (no I/O).
 */
function buildEffectDryRun(input: DeleteReportScheduleInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  if (input.reportId.trim().length === 0) {
    validationErrors.push({
      code: "INVALID_SCHEDULE_ID",
      message: "reportId must be a non-empty report-schedule id",
      field: "reportId",
    });
  }

  const expectedEffect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: { entity_label: ENTITY_LABEL, schedule_handle: input.reportId },
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

export function deleteReportScheduleResponseFormatter(
  result: DeleteReportScheduleOutput
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
          `Dry run: deleting report schedule ${result.reportId} ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). Nothing was deleted.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Deletion of report ${result.reportId} cancelled by user.\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
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
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "cm360",
      contractPlatformSlug: "cm360",
      contractToolSlug: "delete_report_schedule",
      operation: ["delete_schedule"],
      // Effect-class: report schedules have no canonical ad-entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "cm360.delete_report_schedule.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
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
