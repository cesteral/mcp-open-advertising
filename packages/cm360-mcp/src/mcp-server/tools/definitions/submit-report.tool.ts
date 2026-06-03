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
import {
  buildTypedReportConfig,
  CM360DatePresetSchema,
  CM360ReportTypeSchema,
  genericCriteriaSchema,
  validateTypedCriteriaUsage,
} from "../utils/report-config.js";
import type { CM360ReportConfig } from "../../../services/cm360/cm360-reporting-service.js";

const TOOL_NAME = "cm360_submit_report";
const TOOL_TITLE = "Submit CM360 Report";
const TOOL_DESCRIPTION = `Submit a CM360 report without waiting for completion (non-blocking).

Creates the report definition and triggers execution, then returns immediately with the reportId and fileId. Use cm360_check_report_status to poll for completion, then cm360_download_report to fetch results.

Three-step async workflow:
1. cm360_submit_report -> get reportId + fileId
2. cm360_check_report_status -> check status
3. cm360_download_report -> download when REPORT_AVAILABLE`;

export const SubmitReportInputSchema = z
  .object({
    profileId: z.string().min(1).describe("CM360 User Profile ID"),
    name: z.string().describe("Name for the report"),
    type: CM360ReportTypeSchema.describe("Report type"),
    datePreset: CM360DatePresetSchema.optional().describe(
      "Preset date range. Injected into the correct report criteria dateRange when not already set"
    ),
    criteria: genericCriteriaSchema.optional().describe("Criteria for STANDARD reports"),
    reachCriteria: genericCriteriaSchema.optional().describe("Criteria for REACH reports"),
    pathToConversionCriteria: genericCriteriaSchema
      .optional()
      .describe("Criteria for PATH_TO_CONVERSION reports"),
    floodlightCriteria: genericCriteriaSchema
      .optional()
      .describe("Criteria for FLOODLIGHT reports"),
    crossMediaReachCriteria: genericCriteriaSchema
      .optional()
      .describe("Criteria for CROSS_MEDIA_REACH reports"),
    additionalConfig: z
      .record(z.any())
      .optional()
      .describe("Additional report configuration fields"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the report request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be report submission) without calling the CM360 API. No report is created."
      ),
  })
  .superRefine(validateTypedCriteriaUsage)
  .describe("Parameters for submitting a CM360 report");

export const SubmitReportOutputSchema = z
  .object({
    reportId: z
      .string()
      .optional()
      .describe("Report ID for status polling. Absent on a dry_run (nothing was submitted)."),
    fileId: z
      .string()
      .optional()
      .describe("File ID for status polling. Absent on a dry_run (nothing was submitted)."),
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

  const { cm360ReportingService } = resolveSessionServices(sdkContext);

  const reportConfig = buildTypedReportConfig(input) as CM360ReportConfig;

  const result = (await cm360ReportingService.createReport(
    input.profileId,
    reportConfig,
    context
  )) as Record<string, string>;

  const effect: EffectResult = {
    effectKind: "report_requested",
    summary: { report_type: input.type, report_handle: result.reportId },
  };

  return {
    reportId: result.reportId,
    fileId: result.fileId,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `submit_report`. Validates the request (report
 * name non-empty — Zod's `z.string()` admits the empty string) and projects
 * the would-be effect (a report submission). CM360 has no native report
 * validate/preview, so both axes are symbolic. Pure (no I/O).
 */
function buildSubmitReportEffectDryRun(input: SubmitReportInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  if (input.name.trim().length === 0) {
    validationErrors.push({
      code: "INVALID_REPORT_NAME",
      message: "name must be a non-empty report name",
      field: "name",
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
      text: `Report submitted: ${result.reportId} (file: ${result.fileId})\n\nUse cm360_check_report_status with reportId="${result.reportId}" and fileId="${result.fileId}" to check status.\nOnce REPORT_AVAILABLE, use cm360_download_report with the download URL.\n\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "cm360",
      contractPlatformSlug: "cm360",
      contractToolSlug: "submit_report",
      operation: ["submit_report"],
      // Effect-class: an async report submission with no canonical entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "cm360.submit_report.v1",
      // `dry_run` = symbolic validate + symbolic effect projection. CM360 has no
      // native report validate/preview, so both axes are symbolic (honest true).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Submit a standard report using datePreset (non-blocking)",
      input: {
        profileId: "123456",
        name: "Campaign Performance Report",
        type: "STANDARD",
        datePreset: "LAST_30_DAYS",
        criteria: {
          dimensions: [{ name: "campaign" }],
          metricNames: ["impressions", "clicks", "mediaCost"],
        },
      },
    },
    {
      label: "Submit a cross-media reach report",
      input: {
        profileId: "123456",
        name: "Cross Media Reach",
        type: "CROSS_MEDIA_REACH",
        crossMediaReachCriteria: {
          dateRange: { relativeDateRange: "LAST_30_DAYS" },
          dimensions: [{ name: "campaign" }],
          metricNames: ["uniqueReach"],
          dimensionFilters: [],
        },
      },
    },
  ],
  logic: submitReportLogic,
  responseFormatter: submitReportResponseFormatter,
};
