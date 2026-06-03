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

const TOOL_NAME = "tiktok_submit_report";
const TOOL_TITLE = "Submit TikTok Report";
const TOOL_DESCRIPTION = `Submit a TikTok Ads report task without waiting for completion.

Returns a \`taskId\` immediately. Use \`tiktok_check_report_status\` to poll for completion, then \`tiktok_download_report\` to fetch results.

**Non-blocking workflow:**
1. \`tiktok_submit_report\` → get \`taskId\`
2. \`tiktok_check_report_status\` (repeat every 10s) → wait for "DONE"
3. \`tiktok_download_report\` with the \`downloadUrl\` → get parsed data

Use \`tiktok_get_report\` instead for a blocking convenience shortcut.`;

export const SubmitReportInputSchema = z
  .object({
    advertiserId: z
      .string()
      .min(1)
      .describe(
        "TikTok Advertiser ID (informational — the session-bound advertiser from authentication is used for API calls)"
      ),
    reportType: z
      .enum(["BASIC", "AUDIENCE", "PLAYABLE_MATERIAL"])
      .optional()
      .default("BASIC")
      .describe("Report type (default: BASIC)"),
    dimensions: z
      .array(z.string())
      .min(1)
      .describe("Dimensions for the report (e.g., ['campaign_id', 'stat_time_day'])"),
    metrics: z
      .array(z.string())
      .min(1)
      .describe("Metrics to include (e.g., ['impressions', 'clicks', 'spend'])"),
    datePreset: z
      .enum(DATE_PRESET_VALUES)
      .optional()
      .describe("Preset date range. Use this OR startDate+endDate (not both)"),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Start date (YYYY-MM-DD, required if datePreset not provided)"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("End date (YYYY-MM-DD, required if datePreset not provided)"),
    orderField: z.string().optional().describe("Field to order results by"),
    orderType: z.enum(["ASC", "DESC"]).optional().describe("Sort order"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the report request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be report submission) without calling the TikTok API. No report is submitted."
      ),
  })
  .refine(
    (data) =>
      data.datePreset !== undefined || (data.startDate !== undefined && data.endDate !== undefined),
    { message: "Provide either datePreset or both startDate and endDate" }
  )
  .describe("Parameters for submitting a TikTok Ads report");

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

  const { tiktokReportingService } = resolveSessionServices(sdkContext);

  let resolvedStartDate = input.startDate;
  let resolvedEndDate = input.endDate;
  if (input.datePreset) {
    const resolved = resolveDatePreset(input.datePreset);
    resolvedStartDate = resolved.startDate;
    resolvedEndDate = resolved.endDate;
  }

  const result = await tiktokReportingService.submitReport(
    {
      report_type: input.reportType,
      dimensions: input.dimensions,
      metrics: input.metrics,
      start_date: resolvedStartDate!,
      end_date: resolvedEndDate!,
      ...(input.orderField ? { order_field: input.orderField } : {}),
      ...(input.orderType ? { order_type: input.orderType } : {}),
    },
    context
  );

  const effect: EffectResult = {
    effectKind: "report_requested",
    summary: { report_type: input.reportType, report_handle: result.task_id },
  };

  return {
    taskId: result.task_id,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `submit_report`. Validates the request (date-range
 * ordering — a cross-field check Zod's regex can't express) and projects the
 * would-be effect (a report submission). TikTok has no native report
 * validate/preview, so both axes are symbolic. Pure (no I/O).
 */
function buildSubmitReportEffectDryRun(input: SubmitReportInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  if (input.startDate && input.endDate && input.startDate > input.endDate) {
    validationErrors.push({
      code: "INVALID_DATE_RANGE",
      message: `startDate (${input.startDate}) must be on or before endDate (${input.endDate})`,
      field: "startDate",
    });
  }

  const expectedEffect: EffectResult = {
    effectKind: "report_requested",
    summary: { report_type: input.reportType },
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
      text: `Report submitted: ${result.taskId}\n\nUse \`tiktok_check_report_status\` with this taskId to poll for completion.\n\nTimestamp: ${result.timestamp}`,
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
      platform: "tiktok",
      contractPlatformSlug: "tiktok",
      contractToolSlug: "submit_report",
      operation: ["submit_report"],
      // Effect-class: an async report submission with no canonical entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "tiktok.submit_report.v1",
      // `dry_run` = symbolic validate + symbolic effect projection. TikTok has no
      // native report validate/preview, so both axes are symbolic (honest true).
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
        advertiserId: "1234567890",
        dimensions: ["campaign_id", "stat_time_day"],
        metrics: ["impressions", "clicks", "spend", "ctr", "cpc"],
        datePreset: "LAST_7_DAYS",
      },
    },
  ],
  logic: submitReportLogic,
  responseFormatter: submitReportResponseFormatter,
};
