// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { REPORT_DIMENSIONS } from "../../../services/snapchat/report-dimensions.js";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
import { appendSnapchatComputedMetrics } from "../utils/computed-metrics.js";
import {
  arrayRowsToRecords,
  createReportView,
  formatReportViewResponse,
  getReportViewFetchLimit,
  DATE_PRESET_VALUES,
  ReportViewInputSchema,
  ReportViewOutputSchema,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "snapchat_get_report_breakdowns";
const TOOL_TITLE = "Get Snapchat Ads Report with Breakdowns";
const TOOL_DESCRIPTION = `Submit and retrieve an async Snapchat Ads report split by an insight-level dimension (geo, demographic, device or interest).

Like \`snapchat_get_report\` but sends Snapchat's \`report_dimension\` parameter so each row is broken out by that dimension.

**reportDimension values:** country, region, dma, country,os (geo); gender, age, age,gender (demographic); os, os,country, make (device); lifestyle_category (interest). Snapchat allows one dimension at a time, except age with gender.

**Limits (from Snapchat's docs):**
- \`HOUR\` granularity cannot be combined with a dimension; use DAY, TOTAL or LIFETIME.
- region, dma, make and lifestyle_category support delivery metrics only (impressions, swipes, spend, video views, ...). Conversion metrics are not available for them.
- Not available for custom conversions or SKAdNetwork metrics.

\`spend\` is micro-currency (1,000,000 = 1.00 of the account currency).`;

export const GetReportBreakdownsInputSchema = z
  .object({
    adAccountId: z.string().min(1).describe("Snapchat Ad Account ID"),
    fields: z
      .array(z.string())
      .min(1)
      .describe("Base metric fields to include (e.g. ['impressions', 'swipes', 'spend'])"),
    reportDimension: z
      .enum(REPORT_DIMENSIONS)
      .describe(
        "Insight-level breakdown, sent as Snapchat's report_dimension parameter (e.g. 'country', 'age,gender')"
      ),
    datePreset: z
      .enum(DATE_PRESET_VALUES)
      .optional()
      .describe(
        "Preset date range. Use this OR startTime+endTime (not both). Resolved to the ad account's day boundaries (local midnight to local midnight after the last day, in the account's timezone, which is read from the account)"
      ),
    startTime: z
      .string()
      .optional()
      .describe(
        "Start time in ISO 8601 format, required if datePreset not provided. Must be on the start of an hour; for DAY granularity it must be the ad account's day boundary, i.e. local midnight with the account's UTC offset (e.g. 2024-01-01T00:00:00-08:00). A date-only value (2024-01-01) is also accepted"
      ),
    endTime: z
      .string()
      .optional()
      .describe(
        "End time in ISO 8601 format, required if datePreset not provided. Same rules as startTime, and exclusive: to include 2024-01-31 end at the next midnight (2024-02-01T00:00:00-08:00)"
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
    includeComputedMetrics: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Include computed CPA, ROAS, CPM, CTR, CPC derived from raw metrics (spend and conversion_purchases_value are converted from micro-currency first)"
      ),
  })
  .merge(ReportViewInputSchema)
  .refine((data) => data.granularity !== "HOUR", {
    message:
      "HOUR granularity cannot be combined with reportDimension (Snapchat); use DAY, TOTAL or LIFETIME",
    path: ["granularity"],
  })
  .refine(
    (data) =>
      data.datePreset !== undefined || (data.startTime !== undefined && data.endTime !== undefined),
    { message: "Provide either datePreset or both startTime and endTime" }
  )
  .describe("Parameters for generating a Snapchat Ads report with breakdowns");

export const GetReportBreakdownsOutputSchema = z
  .object({
    taskId: z.string().describe("Report task ID"),
    ...ReportViewOutputSchema.shape,
    appliedFields: z.array(z.string()).describe("Metric fields requested"),
    reportDimension: z.enum(REPORT_DIMENSIONS).describe("The report_dimension that was applied"),
    timestamp: z.string().datetime(),
  })
  .describe("Report with breakdowns result");

type GetReportBreakdownsInput = z.infer<typeof GetReportBreakdownsInputSchema>;
type GetReportBreakdownsOutput = z.infer<typeof GetReportBreakdownsOutputSchema>;

export async function getReportBreakdownsLogic(
  input: GetReportBreakdownsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetReportBreakdownsOutput> {
  const { snapchatReportingService, boundAdAccountId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.adAccountId, boundAdAccountId, "adAccountId");

  let resolvedStartTime = input.startTime;
  let resolvedEndTime = input.endTime;
  if (input.datePreset) {
    // Snap measures days in the ad account's timezone (local midnight to local
    // midnight after the last day), so the preset is resolved there.
    ({ start_time: resolvedStartTime, end_time: resolvedEndTime } =
      await snapchatReportingService.resolveDatePresetRange(input.datePreset, context));
  }

  const result = await snapchatReportingService.getReportBreakdowns(
    {
      fields: input.fields,
      granularity: input.granularity,
      start_time: resolvedStartTime!,
      end_time: resolvedEndTime!,
      ...(input.dimensionType ? { dimension_type: input.dimensionType } : {}),
    },
    input.reportDimension,
    getReportViewFetchLimit(input),
    context
  );

  let headers = result.headers;
  let rows = result.rows;

  if (input.includeComputedMetrics) {
    ({ headers, rows } = appendSnapchatComputedMetrics(headers, rows));
  }

  return {
    taskId: result.taskId,
    ...createReportView({
      headers,
      rows: arrayRowsToRecords(headers, rows),
      totalRows: result.totalRows,
      input,
    }),
    appliedFields: input.fields,
    reportDimension: input.reportDimension,
    timestamp: new Date().toISOString(),
  };
}

export function getReportBreakdownsResponseFormatter(
  result: GetReportBreakdownsOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Report task: ${result.taskId}\nApplied fields: ${result.appliedFields.join(", ")}\nReport dimension: ${result.reportDimension}\n\n${formatReportViewResponse(result, "Report data")}`,
    },
  ];
}

export const getReportBreakdownsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetReportBreakdownsInputSchema,
  outputSchema: GetReportBreakdownsOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Campaign report broken down by country",
      input: {
        adAccountId: "1234567890",
        fields: ["impressions", "swipes", "spend"],
        reportDimension: "country",
        datePreset: "LAST_7_DAYS",
        granularity: "DAY",
      },
    },
    {
      label: "Ad squad report broken down by gender and age",
      input: {
        adAccountId: "1234567890",
        fields: ["impressions", "swipes", "spend"],
        reportDimension: "age,gender",
        startTime: "2026-03-01T00:00:00-08:00",
        endTime: "2026-03-05T00:00:00-08:00",
        granularity: "DAY",
      },
    },
  ],
  logic: getReportBreakdownsLogic,
  responseFormatter: getReportBreakdownsResponseFormatter,
  // appliedFields and reportDimension are caller input echoed back; metricContext is never set.
  untrustedContent: {
    structuredPaths: ["$.headers", "$.selectedColumns", "$.rows", "$.previewRows", "$.warnings"],
    contentBlocks: [0],
  },
};
