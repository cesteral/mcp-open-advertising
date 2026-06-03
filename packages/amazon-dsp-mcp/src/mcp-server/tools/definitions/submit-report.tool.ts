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
import { AMAZON_DSP_REPORTING_CONTRACT } from "../../../services/amazon-dsp/amazon-dsp-api-contract.js";
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

const TOOL_NAME = "amazon_dsp_submit_report";
const TOOL_TITLE = "Submit Amazon DSP Report";
const TOOL_DESCRIPTION = `Submit an Amazon DSP report (legacy /dsp/reports API) without waiting for completion.

Returns a \`taskId\` immediately. Use \`amazon_dsp_check_report_status\` to poll for completion (\`SUCCESS\` or \`FAILURE\`), then \`amazon_dsp_download_report\` to fetch results.

**Non-blocking workflow:**
1. \`amazon_dsp_submit_report\` → get \`taskId\`
2. \`amazon_dsp_check_report_status\` (repeat every 10s) → wait for \`SUCCESS\`
3. \`amazon_dsp_download_report\` with the \`downloadUrl\` → parsed data

Use \`amazon_dsp_get_report\` instead for a blocking convenience shortcut.

**Report shape:** each \`type\` (CAMPAIGN, INVENTORY, AUDIENCE, PRODUCTS, TECHNOLOGY, GEOGRAPHY, CONVERSION_SOURCE) is a fixed report category. CAMPAIGN supports breaking down by \`ORDER | LINE_ITEM | CREATIVE\` via \`dimensions\`. \`metrics\` is the list of metric names (impressions, totalCost, viewableImpressions, viewabilityRate, …) — sent to Amazon as a comma-separated string.

Note: Amazon DSP has a maximum 95-day lookback. LAST_90_DAYS is the longest supported preset.`;

export const SubmitReportInputSchema = z
  .object({
    datePreset: z
      .enum(DATE_PRESET_VALUES)
      .optional()
      .describe(
        "Preset date range. Use this OR startDate+endDate (not both). Max 95-day lookback — LAST_90_DAYS is the longest supported preset"
      ),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        "Start date (YYYY-MM-DD format, e.g. 2026-05-01). Max 95-day lookback. Required if datePreset not provided. Converted to YYYYMMDD for the upstream API."
      ),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        "End date (YYYY-MM-DD format). Required if datePreset not provided. Converted to YYYYMMDD for the upstream API."
      ),
    type: z
      .enum(AMAZON_DSP_REPORTING_CONTRACT.reportTypes)
      .describe(
        `Report category. One of: ${AMAZON_DSP_REPORTING_CONTRACT.reportTypes.join(", ")}.`
      ),
    dimensions: z
      .array(z.string())
      .optional()
      .describe(
        "Optional grouping dimensions (type-specific). CAMPAIGN supports ORDER, LINE_ITEM, CREATIVE."
      ),
    metrics: z
      .array(z.string())
      .optional()
      .describe(
        "Metric names to include (e.g. ['impressions', 'totalCost']). Joined to a comma-separated string upstream. Amazon will 422 with the authoritative invalid-list if any name is unknown."
      ),
    timeUnit: z
      .enum(["DAILY", "SUMMARY"])
      .optional()
      .default("DAILY")
      .describe("Time unit for the report (default: DAILY)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the report request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be report submission) without calling the Amazon DSP API. No report is submitted."
      ),
  })
  .refine(
    (data) =>
      data.datePreset !== undefined || (data.startDate !== undefined && data.endDate !== undefined),
    { message: "Provide either datePreset or both startDate and endDate" }
  )
  .describe("Parameters for submitting an Amazon DSP report");

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

  const { amazonDspReportingService } = resolveSessionServices(sdkContext);

  let resolvedStartDate = input.startDate;
  let resolvedEndDate = input.endDate;
  if (input.datePreset) {
    const resolved = resolveDatePreset(input.datePreset);
    resolvedStartDate = resolved.startDate;
    resolvedEndDate = resolved.endDate;
  }

  const result = await amazonDspReportingService.submitReport(
    {
      startDate: resolvedStartDate!,
      endDate: resolvedEndDate!,
      type: input.type,
      dimensions: input.dimensions,
      metrics: input.metrics,
      timeUnit: input.timeUnit,
    },
    context
  );

  const effect: EffectResult = {
    effectKind: "report_requested",
    summary: { report_type: input.type, report_handle: result.taskId },
  };

  return {
    taskId: result.taskId,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `submit_report`. Validates the request (date-range
 * ordering — a cross-field check Zod's regex can't express) and projects the
 * would-be effect (a report submission). Amazon DSP has no native report
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
    summary: { report_type: input.type },
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
      text: `Report submitted: ${result.taskId}\n\nUse \`amazon_dsp_check_report_status\` with this taskId to poll for completion.\n\nTimestamp: ${result.timestamp}`,
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
      platform: "amazon_dsp",
      contractPlatformSlug: "amazon_dsp",
      contractToolSlug: "submit_report",
      operation: ["submit_report"],
      // Effect-class: an async report submission with no canonical entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "amazon_dsp.submit_report.v1",
      // `dry_run` = symbolic validate + symbolic effect projection. Amazon DSP has
      // no native report validate/preview, so both axes are symbolic (honest true).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Daily order-level CAMPAIGN report, last 7 days",
      input: {
        datePreset: "LAST_7_DAYS",
        type: "CAMPAIGN",
        dimensions: ["ORDER"],
        metrics: ["impressions", "totalCost"],
        timeUnit: "DAILY",
      },
    },
  ],
  logic: submitReportLogic,
  responseFormatter: submitReportResponseFormatter,
};
