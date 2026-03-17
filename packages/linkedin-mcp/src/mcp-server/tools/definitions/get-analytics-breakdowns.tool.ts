// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
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
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      .describe("Start date in YYYY-MM-DD format"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      .describe("End date in YYYY-MM-DD format"),
    pivots: z
      .array(z.string())
      .min(1)
      .describe("Pivot dimensions to break down by (e.g., CAMPAIGN, MEMBER_COUNTRY)"),
    metrics: z
      .array(z.string())
      .optional()
      .describe("Metrics to retrieve (defaults to impressions, clicks, costInUsd)"),
  })
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

  const result = await linkedInReportingService.getAnalyticsBreakdowns(
    input.adAccountUrn,
    { start: input.startDate, end: input.endDate },
    input.pivots,
    input.metrics,
    undefined,
    context
  );

  return {
    results: result.results.map((r) => ({
      pivot: r.pivot,
      elements: r.elements as Record<string, unknown>[],
      count: r.elements.length,
    })),
    dateRange: { start: input.startDate, end: input.endDate },
    timestamp: new Date().toISOString(),
  };
}

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
      label: "Get campaign + country breakdown",
      input: {
        adAccountUrn: "urn:li:sponsoredAccount:123456789",
        startDate: "2026-02-01",
        endDate: "2026-03-01",
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