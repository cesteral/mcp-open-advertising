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
  DATE_PRESET_VALUES,
  ReportViewInputSchema,
  ReportViewOutputSchema,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "snapchat_get_report";
const TOOL_TITLE = "Get Snapchat Ads Report";
const TOOL_DESCRIPTION = `Submit and retrieve an async Snapchat Ads performance report.

Follows the async polling pattern: submit task → poll until COMPLETE → download CSV.
This may take 30s–5 minutes depending on the data volume.

**Common fields:** impressions, swipes, spend, video_views, conversion_purchases, reach, frequency, cpm, cpsu
**Granularity:** TOTAL, DAY (default), HOUR, LIFETIME
**start_time/end_time:** ISO 8601 format (e.g. 2024-01-01T00:00:00Z)
**Units:** \`spend\` is micro-currency (1,000,000 = 1.00 of the account currency)`;

export const GetReportInputSchema = z
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
  .refine(
    (data) =>
      data.datePreset !== undefined || (data.startTime !== undefined && data.endTime !== undefined),
    { message: "Provide either datePreset or both startTime and endTime" }
  )
  .describe("Parameters for generating a Snapchat Ads report");

export const GetReportOutputSchema = z
  .object({
    taskId: z.string().describe("Report task ID"),
    ...ReportViewOutputSchema.shape,
    timestamp: z.string().datetime(),
  })
  .describe("Report result");

type GetReportInput = z.infer<typeof GetReportInputSchema>;
type GetReportOutput = z.infer<typeof GetReportOutputSchema>;

export async function getReportLogic(
  input: GetReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetReportOutput> {
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

  const result = await snapchatReportingService.getReport(
    {
      fields: input.fields,
      granularity: input.granularity,
      start_time: resolvedStartTime!,
      end_time: resolvedEndTime!,
      ...(input.dimensionType ? { dimension_type: input.dimensionType } : {}),
    },
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
    timestamp: new Date().toISOString(),
  };
}

export function getReportResponseFormatter(result: GetReportOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Report task: ${result.taskId}\n\n${formatReportViewResponse(result, "Report data")}`,
    },
  ];
}

export const getReportTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetReportInputSchema,
  outputSchema: GetReportOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Campaign delivery report for last 7 days",
      input: {
        adAccountId: "1234567890",
        fields: ["impressions", "swipes", "spend"],
        datePreset: "LAST_7_DAYS",
        granularity: "DAY",
        dimensionType: "CAMPAIGN",
      },
    },
    {
      label: "Ad squad performance report",
      input: {
        adAccountId: "1234567890",
        fields: ["impressions", "swipes", "spend", "conversion_purchases"],
        startTime: "2026-03-01T00:00:00-08:00",
        endTime: "2026-03-05T00:00:00-08:00",
        granularity: "DAY",
      },
    },
  ],
  logic: getReportLogic,
  responseFormatter: getReportResponseFormatter,
  // metricContext is never set; taskId is an id.
  untrustedContent: {
    structuredPaths: ["$.headers", "$.selectedColumns", "$.rows", "$.previewRows", "$.warnings"],
    contentBlocks: [0],
  },
};
