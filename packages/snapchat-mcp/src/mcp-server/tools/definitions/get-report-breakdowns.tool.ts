// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
import { appendSnapchatComputedMetrics } from "../utils/computed-metrics.js";
import {
  arrayRowsToRecords,
  createReportView,
  formatReportViewResponse,
  getReportViewFetchLimit,
  resolveDatePreset,
  DATE_PRESET_VALUES,
  ReportViewInputSchema,
  ReportViewOutputSchema,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "snapchat_get_report_breakdowns";
const TOOL_TITLE = "Get Snapchat Ads Report with Breakdowns";
const TOOL_DESCRIPTION = `Submit and retrieve an async Snapchat Ads report with additional breakdown fields.

Like \`snapchat_get_report\` but adds extra breakdown fields for more granular data.

**Common breakdown fields:** country_code, platform, gender, age, interest_category, placement

**How breakdowns are sent:** the \`breakdowns\` names are appended to the \`fields\` query
parameter. Snapchat's demographic/geo splits may instead require its separate
\`report_dimension\` parameter, which this tool does not send (unverified) — if Snapchat rejects a
breakdown as an unknown field, use \`dimensionType\` for entity-level splits instead.

\`spend\` is micro-currency (1,000,000 = 1.00 of the account currency).`;

export const GetReportBreakdownsInputSchema = z
  .object({
    adAccountId: z.string().min(1).describe("Snapchat Ad Account ID"),
    fields: z
      .array(z.string())
      .min(1)
      .describe("Base metric fields to include (e.g. ['impressions', 'swipes', 'spend'])"),
    breakdowns: z
      .array(z.string())
      .min(1)
      .describe("Additional breakdown fields to add (e.g. ['country_code', 'gender'])"),
    datePreset: z
      .enum(DATE_PRESET_VALUES)
      .optional()
      .describe(
        "Preset date range. Use this OR startTime+endTime (not both). Resolved to UTC-midnight start_time / T23:59:59Z end_time; for a non-UTC ad account prefer explicit startTime/endTime on the account's day boundaries"
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
    includeComputedMetrics: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Include computed CPA, ROAS, CPM, CTR, CPC derived from raw metrics (spend and conversion_purchases_value are converted from micro-currency first)"
      ),
  })
  .merge(ReportViewInputSchema)
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
    appliedFields: z.array(z.string()).describe("All fields used (base + breakdowns)"),
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
    // UNVERIFIED: Snapchat is reported (secondary sources only — its docs host is
    // unreachable from this repo) to require DAY-granularity start/end on day
    // boundaries in the ad account's timezone. These UTC bounds are kept until
    // that is confirmed; the datePreset description tells callers to pass
    // explicit bounds for non-UTC accounts.
    const { startDate, endDate } = resolveDatePreset(input.datePreset);
    resolvedStartTime = `${startDate}T00:00:00Z`;
    resolvedEndTime = `${endDate}T23:59:59Z`;
  }

  const result = await snapchatReportingService.getReportBreakdowns(
    {
      fields: input.fields,
      granularity: input.granularity,
      start_time: resolvedStartTime!,
      end_time: resolvedEndTime!,
      ...(input.dimensionType ? { dimension_type: input.dimensionType } : {}),
    },
    input.breakdowns,
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
    appliedFields: [...input.fields, ...input.breakdowns],
    timestamp: new Date().toISOString(),
  };
}

export function getReportBreakdownsResponseFormatter(
  result: GetReportBreakdownsOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Report task: ${result.taskId}\nApplied fields: ${result.appliedFields.join(", ")}\n\n${formatReportViewResponse(result, "Report data")}`,
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
        breakdowns: ["country_code"],
        datePreset: "LAST_7_DAYS",
        granularity: "DAY",
      },
    },
    {
      label: "Ad squad report broken down by gender and age",
      input: {
        adAccountId: "1234567890",
        fields: ["impressions", "swipes", "spend"],
        breakdowns: ["gender", "age"],
        startTime: "2026-03-01T00:00:00Z",
        endTime: "2026-03-04T23:59:59Z",
        granularity: "DAY",
      },
    },
  ],
  logic: getReportBreakdownsLogic,
  responseFormatter: getReportBreakdownsResponseFormatter,
  // appliedFields is caller input (fields + breakdowns) echoed back; metricContext is never set.
  untrustedContent: {
    structuredPaths: ["$.headers", "$.selectedColumns", "$.rows", "$.previewRows", "$.warnings"],
    contentBlocks: [0],
  },
};
