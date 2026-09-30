// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import {
  DATE_PRESET_VALUES,
  EffectResultSchema,
  EffectDryRunResultSchema,
  DispatchedCapabilitySchema,
  McpError,
  JsonRpcErrorCode,
  NO_UNTRUSTED_CONTENT,
} from "@cesteral/shared";
import type {
  RequestContext,
  McpTextContent,
  SdkContext,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";
import {
  TIKTOK_REPORT_DATA_LEVELS,
  TIKTOK_REPORT_SERVICE_TYPES,
  TIKTOK_SUBMIT_REPORT_UNSUPPORTED_MESSAGE,
} from "../../../services/tiktok/tiktok-reporting-service.js";

const TOOL_NAME = "tiktok_submit_report";
const TOOL_TITLE = "Submit TikTok Report";
const TOOL_DESCRIPTION = `Submit a TikTok Ads async report task — NOT AVAILABLE on TikTok.

TikTok's official Business API SDK defines report task create and status-check operations but no
way to fetch a finished task's rows (no report-task download endpoint, no download URL on the status
response), so a submitted task could never be downloaded. Every call (including \`dry_run\`)
returns an error and no report task is created.

Use \`tiktok_get_report\` (or \`tiktok_get_report_breakdowns\` for breakdowns), which runs the
same report synchronously and returns the rows.`;

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
    serviceType: z
      .enum(TIKTOK_REPORT_SERVICE_TYPES)
      .optional()
      .default("AUCTION")
      .describe("TikTok service_type (default: AUCTION)"),
    dataLevel: z
      .enum(TIKTOK_REPORT_DATA_LEVELS)
      .optional()
      .describe(
        "TikTok data_level for BASIC/AUDIENCE reports, e.g. AUCTION_CAMPAIGN, AUCTION_ADGROUP, AUCTION_AD, AUCTION_ADVERTISER"
      ),
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
        "Accepted for contract compatibility only: a dry run refuses exactly as execute does (TikTok documents no way to fetch an async report task's rows), so nothing is validated or submitted."
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
  _input: SubmitReportInput,
  _context: RequestContext,
  _sdkContext?: SdkContext
): Promise<SubmitReportOutput> {
  // #232: TikTok's official SDK defines no report-task download operation and
  // no download URL on report/task/check/, so a task created here could never
  // be fetched. Refuse before anything reaches TikTok — on dry_run too, since
  // a dry run predicting success for a call that can only fail would mislead
  // governance (as tiktok_duplicate_entity does).
  throw new McpError(JsonRpcErrorCode.InvalidRequest, TIKTOK_SUBMIT_REPORT_UNSUPPORTED_MESSAGE);
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
  untrustedContent: NO_UNTRUSTED_CONTENT,
};
