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

const TOOL_NAME = "sa360_submit_report";
const TOOL_TITLE = "Submit SA360 Async Report";
const TOOL_DESCRIPTION = `Submit an asynchronous report request via the SA360 legacy v2 API.

Returns a report ID that can be used with \`sa360_check_report_status\` to poll for completion, then \`sa360_download_report\` to retrieve results.

**Report types:** campaign, adGroup, keyword, ad, advertiser, productGroup, floodlightActivity, productLeadAndCrossSell
**Workflow:** submit_report → check_report_status (poll) → download_report`;

const REPORT_TYPE_ENUM = [
  "campaign",
  "adGroup",
  "keyword",
  "ad",
  "advertiser",
  "productGroup",
  "floodlightActivity",
  "productLeadAndCrossSell",
] as const;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const ColumnSchema = z.object({
  columnName: z.string().min(1).describe("Column name (e.g., 'impressions', 'clicks', 'cost')"),
  headerText: z.string().optional().describe("Custom header text for the column in the output"),
});

const FilterSchema = z.object({
  column: z.object({
    columnName: z.string().min(1),
  }),
  operator: z
    .string()
    .min(1)
    .describe("Filter operator (e.g., 'equals', 'greaterThan', 'contains')"),
  values: z.array(z.string()).min(1).describe("Filter values"),
});

export const SubmitReportInputSchema = z
  .object({
    agencyId: z.string().min(1).describe("SA360 agency ID"),
    advertiserId: z
      .string()
      .optional()
      .describe("SA360 advertiser ID (optional — omit for agency-level reports)"),
    reportType: z.enum(REPORT_TYPE_ENUM).describe("Type of report to generate"),
    columns: z.array(ColumnSchema).min(1).describe("Columns to include in the report"),
    startDate: z
      .string()
      .regex(DATE_PATTERN, "startDate must be YYYY-MM-DD")
      .describe("Report start date (YYYY-MM-DD)"),
    endDate: z
      .string()
      .regex(DATE_PATTERN, "endDate must be YYYY-MM-DD")
      .describe("Report end date (YYYY-MM-DD)"),
    filters: z.array(FilterSchema).optional().describe("Optional filters to apply to the report"),
    includeRemovedEntities: z
      .boolean()
      .optional()
      .describe("Include removed/deleted entities in results"),
    statisticsCurrency: z
      .string()
      .optional()
      .describe("Currency for monetary metrics (default: 'agency')"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the report request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be report submission) without calling the SA360 API. No report is submitted."
      ),
  })
  .describe("Parameters for submitting an async SA360 report");

export const SubmitReportOutputSchema = z
  .object({
    reportId: z
      .string()
      .optional()
      .describe("Report ID for status polling. Absent on a dry_run (nothing was submitted)."),
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
  .describe("Submitted report confirmation");

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

  const { reportingService } = resolveSessionServices(sdkContext);

  const result = await reportingService.submitReport(
    {
      reportType: input.reportType,
      columns: input.columns,
      timeRange: { startDate: input.startDate, endDate: input.endDate },
      reportScope: {
        agencyId: input.agencyId,
        ...(input.advertiserId && { advertiserId: input.advertiserId }),
      },
      filters: input.filters,
      includeRemovedEntities: input.includeRemovedEntities,
      statisticsCurrency: input.statisticsCurrency,
    },
    context
  );

  const effect: EffectResult = {
    effectKind: "report_requested",
    summary: { report_type: input.reportType, report_handle: result.id },
  };

  return {
    reportId: result.id,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `submit_report`. Validates the request (date-range
 * ordering — a cross-field check Zod's regex can't express) and projects the
 * would-be effect (a report submission). SA360's legacy v2 API has no native
 * report validate/preview, so both axes are symbolic. Pure (no I/O).
 */
function buildSubmitReportEffectDryRun(input: SubmitReportInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  if (input.startDate > input.endDate) {
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
      text: `Report submitted successfully.\nReport ID: ${result.reportId}\n\nUse sa360_check_report_status with this ID to poll for completion.\n\nTimestamp: ${result.timestamp}`,
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
    idempotentHint: false,
    openWorldHint: true,
    destructiveHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "sa360",
      contractPlatformSlug: "sa360",
      contractToolSlug: "submit_report",
      operation: ["submit_report"],
      // Effect-class: an async report submission with no canonical entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "sa360.submit_report.v1",
      // `dry_run` = symbolic validate + symbolic effect projection. SA360's legacy
      // v2 API has no native report validate/preview, so both axes are symbolic.
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
        agencyId: "12345",
        advertiserId: "67890",
        reportType: "campaign",
        columns: [
          { columnName: "campaignId" },
          { columnName: "campaign" },
          { columnName: "impressions" },
          { columnName: "clicks" },
          { columnName: "cost" },
          { columnName: "conversions" },
        ],
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      },
    },
  ],
  logic: submitReportLogic,
  responseFormatter: submitReportResponseFormatter,
};
