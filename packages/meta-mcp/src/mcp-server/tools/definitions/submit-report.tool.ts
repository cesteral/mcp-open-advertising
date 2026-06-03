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
  RequestContext,
  McpTextContent,
  SdkContext,
  EffectResult,
  EffectDryRunResult,
  DispatchedCapability,
  DryRunValidationError,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "meta_submit_report";
const TOOL_TITLE = "Submit Meta Async Insights Report";
const TOOL_DESCRIPTION = `Submit a Meta Ads async insights report without waiting for completion.

Returns a \`reportRunId\` immediately. Use \`meta_check_report_status\` to poll for completion, then \`meta_download_report\` to fetch results.

**Non-blocking workflow:**
1. \`meta_submit_report\` → get \`reportRunId\`
2. \`meta_check_report_status\` (repeat every 10s) → wait for "Job Succeeded"
3. \`meta_download_report\` with the \`reportRunId\` → get parsed data

**Status values:** "Job Not Started", "Job Started", "Job Running", "Job Succeeded", "Job Failed"

Use \`meta_get_insights\` instead for a blocking convenience shortcut on smaller date ranges.`;

export const SubmitReportInputSchema = z
  .object({
    entityId: z
      .string()
      .min(1)
      .describe("Entity ID to get insights for (account act_XXX, campaign, ad set, or ad ID)"),
    fields: z
      .array(z.string())
      .optional()
      .describe("Metrics/fields to return (defaults to 12 core metrics)"),
    datePreset: z
      .string()
      .optional()
      .describe("Date preset (today, yesterday, last_7d, last_30d, etc.)"),
    timeRange: z
      .object({
        since: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
          .describe("Start date YYYY-MM-DD"),
        until: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
          .describe("End date YYYY-MM-DD"),
      })
      .optional()
      .describe("Custom date range (mutually exclusive with datePreset)"),
    timeIncrement: z
      .string()
      .optional()
      .describe("Time granularity: '1' for daily, '7' for weekly, 'monthly', 'all_days'"),
    level: z
      .string()
      .optional()
      .describe("Aggregation level: 'account', 'campaign', 'adset', 'ad'"),
    breakdowns: z
      .array(z.string())
      .optional()
      .describe("Breakdown dimensions (e.g., ['age', 'gender', 'country'])"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the report request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be insights report submission) without calling the Meta API. No report is submitted."
      ),
  })
  .superRefine((val, ctx) => {
    if (val.datePreset && val.timeRange) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["timeRange"],
        message: "Cannot specify both datePreset and timeRange",
      });
    }
  })
  .describe("Parameters for submitting a Meta Ads async insights report");

export const SubmitReportOutputSchema = z
  .object({
    reportRunId: z
      .string()
      .optional()
      .describe(
        "Report run ID for status polling and result download. Absent on a dry_run (nothing was submitted)."
      ),
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

const REPORT_TYPE = "insights";

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
  // (an insights report submission). No API call.
  if (input.dry_run === true) {
    const dryRun = buildSubmitReportEffectDryRun(input);
    return {
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const { metaInsightsService } = resolveSessionServices(sdkContext);

  const result = await metaInsightsService.submitInsightsReport(
    input.entityId,
    {
      fields: input.fields,
      datePreset: input.datePreset,
      timeRange: input.timeRange,
      timeIncrement: input.timeIncrement,
      level: input.level,
      breakdowns: input.breakdowns,
    },
    context
  );

  const effect: EffectResult = {
    effectKind: "report_requested",
    summary: { report_type: REPORT_TYPE, report_handle: result.reportRunId },
  };

  return {
    reportRunId: result.reportRunId,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `submit_report`. Validates the request (custom
 * time-range ordering — a cross-field check Zod's regex can't express) and
 * projects the would-be effect (an insights report submission). Meta has no
 * native insights validate/preview, so both axes are symbolic. Pure (no I/O).
 */
function buildSubmitReportEffectDryRun(input: SubmitReportInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  if (input.timeRange && input.timeRange.since > input.timeRange.until) {
    validationErrors.push({
      code: "INVALID_DATE_RANGE",
      message: `timeRange.since (${input.timeRange.since}) must be on or before timeRange.until (${input.timeRange.until})`,
      field: "timeRange.since",
    });
  }

  const expectedEffect: EffectResult = {
    effectKind: "report_requested",
    summary: { report_type: REPORT_TYPE },
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
      text: `Report submitted: ${result.reportRunId}\n\nUse \`meta_check_report_status\` with this reportRunId to poll for completion.\n\nTimestamp: ${result.timestamp}`,
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
      platform: "meta_ads",
      contractPlatformSlug: "meta",
      contractToolSlug: "submit_report",
      operation: ["submit_report"],
      // Effect-class: an async insights report submission with no canonical entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "meta.submit_report.v1",
      // `dry_run` = symbolic validate + symbolic effect projection. Meta has no
      // native insights validate/preview, so both axes are symbolic (honest true).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Submit last 30 days campaign performance report",
      input: {
        entityId: "act_123456789",
        datePreset: "last_30d",
        level: "campaign",
      },
    },
    {
      label: "Submit custom date range report with breakdowns",
      input: {
        entityId: "23456789012345",
        fields: ["impressions", "clicks", "spend", "actions", "action_values"],
        timeRange: { since: "2026-01-01", until: "2026-01-31" },
        timeIncrement: "1",
        breakdowns: ["age", "gender"],
      },
    },
  ],
  logic: submitReportLogic,
  responseFormatter: submitReportResponseFormatter,
};
