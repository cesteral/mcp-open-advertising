// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  getInsightsEntityTypeEnum,
  getInsightsQueryResource,
  getInsightsIdField,
  getInsightsNameField,
  type SA360InsightsEntityType,
} from "../utils/entity-mapping.js";
import { addComputedMetrics } from "../utils/computed-metrics.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "sa360_get_insights";
const TOOL_TITLE = "SA360 Performance Insights";
const TOOL_DESCRIPTION = `Get performance insights for SA360 entities using preset parameters.

Convenience wrapper around SA360 query language that constructs queries from simple inputs. For ad-hoc queries, use \`sa360_search\` directly.

**Supported entity types:** ${getInsightsEntityTypeEnum().join(", ")}

**Default metrics:** impressions, clicks, cost_micros, conversions, ctr, average_cpc

**Date ranges:** Preset (TODAY, YESTERDAY, LAST_7_DAYS, etc.) OR custom (startDate + endDate)

**Computed metrics:** Set includeComputedMetrics=true for derived CPA, ROAS, CPM`;

const METRIC_NAME_PATTERN = /^(metrics\.)?[a-z_][a-z0-9_]*$/;

const DATE_RANGE_ENUM = [
  "TODAY",
  "YESTERDAY",
  "LAST_7_DAYS",
  "LAST_30_DAYS",
  "THIS_MONTH",
  "LAST_MONTH",
  "LAST_90_DAYS",
] as const;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const DEFAULT_METRICS = [
  "metrics.impressions",
  "metrics.clicks",
  "metrics.cost_micros",
  "metrics.conversions",
  "metrics.ctr",
  "metrics.average_cpc",
];

export const GetInsightsInputSchema = z
  .object({
    customerId: z
      .string()
      .regex(/^\d+$/, "customerId must be numeric")
      .describe("SA360 customer ID (no dashes)"),
    entityType: z
      .enum(getInsightsEntityTypeEnum())
      .describe("Type of entity to get insights for"),
    entityId: z
      .string()
      .regex(/^\d+$/, "entityId must be numeric")
      .optional()
      .describe("Filter to a specific entity ID"),
    dateRange: z
      .enum(DATE_RANGE_ENUM)
      .optional()
      .describe("Preset date range for metrics (use this OR startDate+endDate)"),
    startDate: z
      .string()
      .regex(DATE_PATTERN, "startDate must be YYYY-MM-DD")
      .optional()
      .describe("Custom start date (YYYY-MM-DD) — requires endDate"),
    endDate: z
      .string()
      .regex(DATE_PATTERN, "endDate must be YYYY-MM-DD")
      .optional()
      .describe("Custom end date (YYYY-MM-DD) — requires startDate"),
    metrics: z
      .array(
        z
          .string()
          .regex(
            METRIC_NAME_PATTERN,
            "metrics must be metric names like 'clicks' or 'metrics.clicks'"
          )
      )
      .optional()
      .describe(
        "Metrics to include (defaults to impressions, clicks, cost_micros, conversions, ctr, average_cpc)"
      ),
    includeComputedMetrics: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include computed CPA, ROAS, CPM derived from raw metrics"),
    limit: z
      .number()
      .min(1)
      .max(10000)
      .optional()
      .default(50)
      .describe("Max results to return (default 50)"),
    pageToken: z
      .string()
      .optional()
      .describe("Page token for pagination (from previous response)"),
  })
  .refine(
    (data) => {
      const hasPreset = !!data.dateRange;
      const hasCustomStart = !!data.startDate;
      const hasCustomEnd = !!data.endDate;
      // Must have preset OR both custom dates (not both, not neither)
      if (hasPreset && (hasCustomStart || hasCustomEnd)) return false;
      if (!hasPreset && !hasCustomStart && !hasCustomEnd) return false;
      if (hasCustomStart !== hasCustomEnd) return false;
      return true;
    },
    {
      message: "Provide either dateRange OR both startDate and endDate (not both, not neither)",
    }
  )
  .describe("Parameters for getting SA360 performance insights");

export const GetInsightsOutputSchema = z
  .object({
    results: z.array(z.record(z.any())).describe("Insight result rows"),
    totalResults: z.number().describe("Number of results returned"),
    dateRange: z.string().describe("Date range used"),
    startDate: z.string().optional().describe("Custom start date (when used)"),
    endDate: z.string().optional().describe("Custom end date (when used)"),
    nextPageToken: z.string().optional().describe("Token to fetch the next page of results"),
    has_more: z.boolean().describe("Whether more results are available via pagination"),
    timestamp: z.string().datetime(),
  })
  .describe("SA360 performance insights");

type GetInsightsInput = z.infer<typeof GetInsightsInputSchema>;
type GetInsightsOutput = z.infer<typeof GetInsightsOutputSchema>;

function buildInsightsQuery(input: GetInsightsInput): string {
  const entityType = input.entityType as SA360InsightsEntityType;
  const resource = getInsightsQueryResource(entityType);
  const idField = getInsightsIdField(entityType);
  const nameField = getInsightsNameField(entityType);

  const metricFields =
    input.metrics && input.metrics.length > 0
      ? input.metrics.map((m) => {
          if (!METRIC_NAME_PATTERN.test(m)) {
            throw new Error(`Invalid metric name: ${m}`);
          }
          return m.startsWith("metrics.") ? m : `metrics.${m}`;
        })
      : DEFAULT_METRICS;

  const selectFields = [idField, nameField, ...metricFields].join(", ");

  const whereClauses: string[] = [];

  if (input.dateRange) {
    whereClauses.push(`segments.date DURING ${input.dateRange}`);
  } else if (input.startDate && input.endDate) {
    whereClauses.push(`segments.date BETWEEN '${input.startDate}' AND '${input.endDate}'`);
  }

  if (input.entityId) {
    if (!/^\d+$/.test(input.entityId)) {
      throw new Error("entityId must be numeric");
    }
    whereClauses.push(`${idField} = ${input.entityId}`);
  }

  const whereClause = whereClauses.join(" AND ");

  return `SELECT ${selectFields} FROM ${resource} WHERE ${whereClause} ORDER BY metrics.impressions DESC LIMIT ${input.limit}`;
}

export async function getInsightsLogic(
  input: GetInsightsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetInsightsOutput> {
  const { sa360Service } = resolveSessionServices(sdkContext);

  const query = buildInsightsQuery(input);

  const result = await sa360Service.sa360Search(
    input.customerId,
    query,
    input.limit,
    input.pageToken,
    context
  );

  let results = result.results as unknown as Record<string, any>[];

  if (input.includeComputedMetrics) {
    results = results.map(addComputedMetrics);
  }

  const dateRangeLabel = input.dateRange || `${input.startDate} to ${input.endDate}`;

  return {
    results,
    totalResults: results.length,
    dateRange: dateRangeLabel,
    ...(input.startDate && { startDate: input.startDate }),
    ...(input.endDate && { endDate: input.endDate }),
    nextPageToken: result.nextPageToken,
    has_more: !!result.nextPageToken,
    timestamp: new Date().toISOString(),
  };
}

export function getInsightsResponseFormatter(result: GetInsightsOutput): McpTextContent[] {
  const paginationNote = result.has_more
    ? ` — more pages available (use pageToken: "${result.nextPageToken}")`
    : "";
  return [
    {
      type: "text" as const,
      text: `Insights (${result.dateRange}): ${result.totalResults} results${paginationNote}\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getInsightsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetInsightsInputSchema,
  outputSchema: GetInsightsOutputSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Cross-engine campaign performance last 30 days",
      input: {
        customerId: "1234567890",
        entityType: "campaign",
        dateRange: "LAST_30_DAYS",
      },
    },
    {
      label: "Ad group metrics for specific campaign",
      input: {
        customerId: "1234567890",
        entityType: "adGroup",
        dateRange: "LAST_7_DAYS",
        limit: 100,
      },
    },
    {
      label: "Custom date range with computed metrics",
      input: {
        customerId: "1234567890",
        entityType: "campaign",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        includeComputedMetrics: true,
      },
    },
  ],
  logic: getInsightsLogic,
  responseFormatter: getInsightsResponseFormatter,
};
