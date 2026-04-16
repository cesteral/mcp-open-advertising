// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  appendComputedMetricsToRows,
  ComputedMetricsFlagSchema,
  DATE_PRESET_VALUES,
  resolveDatePreset,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "linkedin_get_analytics_breakdowns";
const TOOL_TITLE = "Get LinkedIn Ads Analytics with Breakdowns";
const TOOL_DESCRIPTION = `Get analytics with multiple dimensional breakdowns for a LinkedIn Ads account.

Runs one analytics query per pivot and returns combined results.

**Useful pivot combinations:**
- CAMPAIGN + MEMBER_COUNTRY: campaign performance by geography
- CAMPAIGN + MEMBER_JOB_TITLE: audience composition
- CREATIVE + CAMPAIGN: creative performance within campaigns`;

export const GetAnalyticsBreakdownsInputSchema = z
  .object({
    adAccountUrn: z
      .string()
      .min(1)
      .describe("The ad account URN (e.g., urn:li:sponsoredAccount:123)"),
    datePreset: z
      .enum(DATE_PRESET_VALUES)
      .optional()
      .describe("Preset date range. Use this OR startDate+endDate (not both)"),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      .optional()
      .describe("Start date in YYYY-MM-DD format (required if datePreset not provided)"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      .optional()
      .describe("End date in YYYY-MM-DD format (required if datePreset not provided)"),
    pivots: z
      .array(z.string())
      .min(1)
      .describe("Pivot dimensions to break down by (e.g., CAMPAIGN, MEMBER_COUNTRY)"),
    metrics: z
      .array(z.string())
      .optional()
      .describe("Metrics to retrieve (defaults to impressions, clicks, costInUsd)"),
  })
  .merge(ComputedMetricsFlagSchema)
  .refine(
    (data) => data.datePreset !== undefined || (data.startDate !== undefined && data.endDate !== undefined),
    { message: "Provide either datePreset or both startDate and endDate" }
  )
  .describe("Parameters for getting LinkedIn Ads analytics with breakdowns");

export const GetAnalyticsBreakdownsOutputSchema = z
  .object({
    results: z.array(
      z.object({
        pivot: z.string(),
        elements: z.array(z.record(z.any())),
        count: z.number(),
      })
    ).describe("Analytics results per pivot"),
    dateRange: z.object({ start: z.string(), end: z.string() }),
    timestamp: z.string().datetime(),
  })
  .describe("Analytics breakdowns result");

type GetAnalyticsBreakdownsInput = z.infer<typeof GetAnalyticsBreakdownsInputSchema>;
type GetAnalyticsBreakdownsOutput = z.infer<typeof GetAnalyticsBreakdownsOutputSchema>;

export async function getAnalyticsBreakdownsLogic(
  input: GetAnalyticsBreakdownsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetAnalyticsBreakdownsOutput> {
  const { linkedInReportingService } = resolveSessionServices(sdkContext);

  let resolvedStartDate = input.startDate;
  let resolvedEndDate = input.endDate;
  if (input.datePreset) {
    const resolved = resolveDatePreset(input.datePreset);
    resolvedStartDate = resolved.startDate;
    resolvedEndDate = resolved.endDate;
  }

  const result = await linkedInReportingService.getAnalyticsBreakdowns(
    input.adAccountUrn,
    { start: resolvedStartDate!, end: resolvedEndDate! },
    input.pivots,
    input.metrics,
    undefined,
    context
  );

  return {
    results: result.results.map((r) => {
      const raw = r.elements as Record<string, unknown>[];
      const stringRows: Record<string, string>[] = raw.map((row) => {
        const record: Record<string, string> = {};
        for (const [k, v] of Object.entries(row)) {
          record[k] =
            typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
        }
        return record;
      });
      const elements = input.includeComputedMetrics
        ? appendComputedMetricsToRows(
            stringRows,
            BREAKDOWNS_COMPUTED_METRIC_ALIASES,
          )
        : stringRows;
      return {
        pivot: r.pivot,
        elements: elements as Record<string, unknown>[],
        count: elements.length,
      };
    }),
    dateRange: { start: resolvedStartDate!, end: resolvedEndDate! },
    timestamp: new Date().toISOString(),
  };
}

const BREAKDOWNS_COMPUTED_METRIC_ALIASES = {
  cost: ["costInUsd", "costInLocalCurrency"],
  impressions: ["impressions"],
  clicks: ["clicks"],
  conversions: ["externalWebsiteConversions", "conversions", "oneClickLeads"],
  conversionValue: ["conversionValueInLocalCurrency"],
};

export function getAnalyticsBreakdownsResponseFormatter(
  result: GetAnalyticsBreakdownsOutput
): McpTextContent[] {
  const lines: string[] = [
    `Analytics Breakdowns — Date range: ${result.dateRange.start} to ${result.dateRange.end}`,
    "",
  ];

  for (const r of result.results) {
    lines.push(`## ${r.pivot} (${r.count} rows)`);
    lines.push(JSON.stringify(r.elements, null, 2));
    lines.push("");
  }

  lines.push(`Timestamp: ${result.timestamp}`);

  return [
    {
      type: "text" as const,
      text: lines.join("\n"),
    },
  ];
}

export const getAnalyticsBreakdownsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetAnalyticsBreakdownsInputSchema,
  outputSchema: GetAnalyticsBreakdownsOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Get campaign + country breakdown for last 30 days",
      input: {
        adAccountUrn: "urn:li:sponsoredAccount:123456789",
        datePreset: "LAST_30_DAYS",
        pivots: ["CAMPAIGN", "MEMBER_COUNTRY"],
        metrics: ["impressions", "clicks", "costInUsd"],
      },
    },
    {
      label: "Get creative performance breakdown",
      input: {
        adAccountUrn: "urn:li:sponsoredAccount:123456789",
        startDate: "2026-01-01",
        endDate: "2026-03-01",
        pivots: ["CREATIVE"],
      },
    },
  ],
  logic: getAnalyticsBreakdownsLogic,
  responseFormatter: getAnalyticsBreakdownsResponseFormatter,
};
