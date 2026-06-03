// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  resolveDatePreset,
  DATE_PRESET_VALUES,
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

const TOOL_NAME = "snapchat_submit_report";
const TOOL_TITLE = "Submit Snapchat Report";
const TOOL_DESCRIPTION = `Submit a Snapchat Ads report task without waiting for completion.

Returns a \`taskId\` immediately. This is Snapchat's \`report_run_id\`.
Use \`snapchat_check_report_status\` to poll for completion, then \`snapchat_download_report\` to fetch results.

**Non-blocking workflow:**
1. \`snapchat_submit_report\` → get \`taskId\`
2. \`snapchat_check_report_status\` (repeat every 10s) → wait for "COMPLETE"
3. \`snapchat_download_report\` with the \`downloadUrl\` → get parsed data

Use \`snapchat_get_report\` instead for a blocking convenience shortcut.`;

const DEFAULT_REPORT_TYPE = "account";

export const SubmitReportInputSchema = z
  .object({
    adAccountId: z.string().min(1).describe("Snapchat Ad Account ID"),
    fields: z
      .array(z.string())
      .min(1)
      .describe("Metric fields to include (e.g. ['impressions', 'swipes', 'spend'])"),
    datePreset: z
      .enum(DATE_PRESET_VALUES)
      .optional()
      .describe(
        "Preset date range. Use this OR startTime+endTime (not both). Converted to ISO 8601 timestamps automatically"
      ),
    startTime: z
      .string()
      .optional()
      .describe(
        "Start time in ISO 8601 format (e.g. 2024-01-01T00:00:00Z, required if datePreset not provided)"
      ),
    endTime: z
      .string()
      .optional()
      .describe(
        "End time in ISO 8601 format (e.g. 2024-01-31T23:59:59Z, required if datePreset not provided)"
      ),
    granularity: z
      .enum(["TOTAL", "DAY", "HOUR", "LIFETIME"])
      .optional()
      .default("DAY")
      .describe("Time granularity (default: DAY)"),
    dimensionType: z
      .enum(["CAMPAIGN", "AD_SQUAD", "AD"])
      .optional()
      .describe("Entity level for stats breakdown (default: account-level aggregate)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the report request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be report submission) without calling the Snapchat API. No report is submitted."
      ),
  })
  .refine(
    (data) =>
      data.datePreset !== undefined || (data.startTime !== undefined && data.endTime !== undefined),
    { message: "Provide either datePreset or both startTime and endTime" }
  )
  .describe("Parameters for submitting a Snapchat Ads report");

export const SubmitReportOutputSchema = z
  .object({
    taskId: z
      .string()
      .optional()
      .describe("Report task ID for status polling. Absent on a dry_run (nothing was submitted)."),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No report was submitted."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `report_requested` + scalar audit summary). Present on a confirmed execute. Effect writes carry no canonical entity snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `submit_report` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Report submission result");

type SubmitReportInput = z.infer<typeof SubmitReportInputSchema>;
type SubmitReportOutput = z.infer<typeof SubmitReportOutputSchema>;

export async function submitReportLogic(
  input: SubmitReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<SubmitReportOutput> {
  // Effect-class write: no canonical entity snapshot. The capability is
  // `submit_report` with a null entity kind on every response.
  const dispatchedCapability: DispatchedCapability = {
    operation: "submit_report",
    canonicalEntityKind: null,
  };

  // Symbolic dry-run: validate the request and project the would-be effect
  // (a report submission). No API call.
  if (input.dry_run === true) {
    const dryRun = buildSubmitReportEffectDryRun(input);
    return {
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const { snapchatReportingService } = resolveSessionServices(sdkContext);

  let resolvedStartTime = input.startTime;
  let resolvedEndTime = input.endTime;
  if (input.datePreset) {
    const { startDate, endDate } = resolveDatePreset(input.datePreset);
    resolvedStartTime = `${startDate}T00:00:00Z`;
    resolvedEndTime = `${endDate}T23:59:59Z`;
  }

  const result = await snapchatReportingService.submitReport(
    {
      fields: input.fields,
      granularity: input.granularity,
      start_time: resolvedStartTime!,
      end_time: resolvedEndTime!,
      ...(input.dimensionType ? { dimension_type: input.dimensionType } : {}),
    },
    context
  );

  const effect: EffectResult = {
    effectKind: "report_requested",
    summary: {
      report_type: input.dimensionType ?? DEFAULT_REPORT_TYPE,
      report_handle: result.task_id,
    },
  };

  return {
    taskId: result.task_id,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `submit_report`. Validates the request (custom
 * time-range ordering — a cross-field check Zod can't express) and projects the
 * would-be effect (a report submission). Snapchat has no native report
 * validate/preview, so both axes are symbolic. Pure (no I/O).
 */
function buildSubmitReportEffectDryRun(input: SubmitReportInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  if (input.startTime && input.endTime && input.startTime > input.endTime) {
    validationErrors.push({
      code: "INVALID_DATE_RANGE",
      message: `startTime (${input.startTime}) must be on or before endTime (${input.endTime})`,
      field: "startTime",
    });
  }

  const expectedEffect: EffectResult = {
    effectKind: "report_requested",
    summary: { report_type: input.dimensionType ?? DEFAULT_REPORT_TYPE },
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

export function submitReportResponseFormatter(result: SubmitReportOutput): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedEffectSource } =
      result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    const rt = result.dryRun.expectedEffect?.summary.report_type ?? "report";
    return [
      {
        type: "text" as const,
        text:
          `Dry run: submitting a ${String(rt)} report ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No report was submitted.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Report submitted: ${result.taskId}\n\nUse \`snapchat_check_report_status\` with this taskId to poll for completion.\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const submitReportTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: SubmitReportInputSchema,
  outputSchema: SubmitReportOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "snapchat",
      contractPlatformSlug: "snapchat",
      contractToolSlug: "submit_report",
      operation: ["submit_report"],
      // Effect-class: an async report submission with no canonical entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "snapchat.submit_report.v1",
      // `dry_run` = symbolic validate + symbolic effect projection. Snapchat has
      // no native report validate/preview, so both axes are symbolic (honest true).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Submit campaign performance report",
      input: {
        adAccountId: "1234567890",
        fields: ["impressions", "swipes", "spend"],
        datePreset: "LAST_7_DAYS",
        granularity: "DAY",
        dimensionType: "CAMPAIGN",
      },
    },
  ],
  logic: submitReportLogic,
  responseFormatter: submitReportResponseFormatter,
};
