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

const TOOL_NAME = "msads_submit_report";
const TOOL_TITLE = "Submit Microsoft Ads Report";
const TOOL_DESCRIPTION = `Submit a Microsoft Advertising report request without waiting for completion (non-blocking).

Returns a ReportRequestId that can be used with msads_check_report_status to poll for results.`;

export const SubmitReportInputSchema = z
  .object({
    reportType: z.string().describe("Report type (e.g., CampaignPerformanceReportRequest)"),
    accountId: z.string().describe("Microsoft Ads Account ID"),
    columns: z.array(z.string()).min(1).describe("Report columns to include"),
    datePreset: z
      .enum(DATE_PRESET_VALUES)
      .optional()
      .describe("Preset date range. Use this OR startDate+endDate (not both)"),
    startDate: z
      .string()
      .optional()
      .describe("Start date (YYYY-MM-DD, required if datePreset not provided)"),
    endDate: z
      .string()
      .optional()
      .describe("End date (YYYY-MM-DD, required if datePreset not provided)"),
    aggregation: z
      .string()
      .optional()
      .describe("Time aggregation (Daily, Weekly, Monthly, Hourly). Default: Daily"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the report request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be report submission) without calling the Microsoft Ads API. No report is submitted."
      ),
  })
  .refine(
    (data) =>
      data.datePreset !== undefined || (data.startDate !== undefined && data.endDate !== undefined),
    { message: "Provide either datePreset or both startDate and endDate" }
  )
  .describe("Parameters for submitting a Microsoft Ads report");

export const SubmitReportOutputSchema = z
  .object({
    reportRequestId: z
      .string()
      .optional()
      .describe(
        "Report request ID for status polling. Absent on a dry_run (nothing was submitted)."
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

  const { msadsReportingService } = resolveSessionServices(sdkContext);

  let resolvedStartDate = input.startDate;
  let resolvedEndDate = input.endDate;
  if (input.datePreset) {
    const resolved = resolveDatePreset(input.datePreset);
    resolvedStartDate = resolved.startDate;
    resolvedEndDate = resolved.endDate;
  }

  const reportRequestId = await msadsReportingService.submitReport(
    {
      reportType: input.reportType,
      accountId: input.accountId,
      columns: input.columns,
      dateRange: { startDate: resolvedStartDate!, endDate: resolvedEndDate! },
      aggregation: input.aggregation,
    },
    context
  );

  const effect: EffectResult = {
    effectKind: "report_requested",
    summary: { report_type: input.reportType, report_handle: reportRequestId },
  };

  return {
    reportRequestId,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `submit_report`. Validates the request and projects
 * the would-be effect (a report submission). Microsoft Ads' `startDate`/`endDate`
 * are free strings (no Zod regex), so this mirrors the execute-path
 * `parseDate` format check (`YYYY-MM-DD`) plus the cross-field ordering check —
 * otherwise a lexicographically-ordered but malformed pair (e.g. "foo"/"zzz")
 * would dry-run as `wouldSucceed: true` while execute rejects it. Microsoft Ads
 * has no native report validate/preview, so both axes are symbolic. Pure (no I/O).
 */
function buildSubmitReportEffectDryRun(input: SubmitReportInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  // Custom dates only reach the upstream when datePreset is absent; a preset
  // resolves to valid YYYY-MM-DD server-side. Validate each provided date's
  // format exactly as the execute path's parseDate does.
  const checkFormat = (value: string | undefined, field: string): boolean => {
    if (value !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      validationErrors.push({
        code: "INVALID_DATE_FORMAT",
        message: `${field} must be YYYY-MM-DD — got "${value}"`,
        field,
      });
      return false;
    }
    return true;
  };
  const startOk = checkFormat(input.startDate, "startDate");
  const endOk = checkFormat(input.endDate, "endDate");
  if (startOk && endOk && input.startDate && input.endDate && input.startDate > input.endDate) {
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
      text: `Report submitted successfully.\n\nReportRequestId: ${result.reportRequestId}\n\nUse msads_check_report_status to poll for completion.\n\nTimestamp: ${result.timestamp}`,
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
    idempotentHint: false,
    destructiveHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "msads",
      contractPlatformSlug: "msads",
      contractToolSlug: "submit_report",
      operation: ["submit_report"],
      // Effect-class: an async report submission with no canonical entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "msads.submit_report.v1",
      // `dry_run` = symbolic validate + symbolic effect projection. Microsoft Ads
      // has no native report validate/preview, so both axes are symbolic (honest true).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Submit keyword performance report",
      input: {
        reportType: "KeywordPerformanceReportRequest",
        accountId: "123456789",
        columns: ["Keyword", "Impressions", "Clicks", "AverageCpc"],
        datePreset: "LAST_30_DAYS",
      },
    },
  ],
  logic: submitReportLogic,
  responseFormatter: submitReportResponseFormatter,
};
