import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "gads_get_insights";
const TOOL_TITLE = "Google Ads Performance Insights";
const TOOL_DESCRIPTION = `Get performance insights for Google Ads entities using preset parameters.

Convenience wrapper around GAQL that constructs queries from simple inputs. For ad-hoc queries, use \`gads_gaql_search\` directly.

**Supported entity types:** campaign, adGroup, ad, keyword

**Default metrics:** impressions, clicks, cost_micros, conversions, ctr, average_cpc

**Date ranges:** TODAY, YESTERDAY, LAST_7_DAYS, LAST_30_DAYS, THIS_MONTH, LAST_MONTH, LAST_90_DAYS`;

const ENTITY_TYPE_ENUM = ["campaign", "adGroup", "ad", "keyword"] as const;
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

const DEFAULT_METRICS = [
  "metrics.impressions",
  "metrics.clicks",
  "metrics.cost_micros",
  "metrics.conversions",
  "metrics.ctr",
  "metrics.average_cpc",
];

const GAQL_RESOURCE_MAP: Record<string, string> = {
  campaign: "campaign",
  adGroup: "ad_group",
  ad: "ad_group_ad",
  keyword: "keyword_view",
};

const ENTITY_ID_FIELD_MAP: Record<string, string> = {
  campaign: "campaign.id",
  adGroup: "ad_group.id",
  ad: "ad_group_ad.ad.id",
  keyword: "ad_group_criterion.criterion_id",
};

const ENTITY_NAME_FIELD_MAP: Record<string, string> = {
  campaign: "campaign.name",
  adGroup: "ad_group.name",
  ad: "ad_group_ad.ad.name",
  keyword: "ad_group_criterion.keyword.text",
};

export const GetInsightsInputSchema = z
  .object({
    customerId: z
      .string()
      .regex(/^\d+$/, "customerId must be numeric")
      .describe("Google Ads customer ID (no dashes)"),
    entityType: z
      .enum(ENTITY_TYPE_ENUM)
      .describe("Type of entity to get insights for"),
    entityId: z
      .string()
      .regex(/^\d+$/, "entityId must be numeric")
      .optional()
      .describe("Filter to a specific entity ID"),
    dateRange: z
      .enum(DATE_RANGE_ENUM)
      .describe("Date range for metrics"),
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
    limit: z
      .number()
      .min(1)
      .max(10000)
      .optional()
      .default(50)
      .describe("Max results to return (default 50)"),
  })
  .describe("Parameters for getting Google Ads performance insights");

export const GetInsightsOutputSchema = z
  .object({
    results: z.array(z.record(z.any())).describe("Insight result rows"),
    totalResults: z.number().describe("Number of results returned"),
    dateRange: z.string().describe("Date range used"),
    timestamp: z.string().datetime(),
  })
  .describe("Google Ads performance insights");

type GetInsightsInput = z.infer<typeof GetInsightsInputSchema>;
type GetInsightsOutput = z.infer<typeof GetInsightsOutputSchema>;

function buildGaqlQuery(input: GetInsightsInput): string {
  const resource = GAQL_RESOURCE_MAP[input.entityType];
  const idField = ENTITY_ID_FIELD_MAP[input.entityType];
  const nameField = ENTITY_NAME_FIELD_MAP[input.entityType];

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

  const whereClauses: string[] = [
    `segments.date DURING ${input.dateRange}`,
  ];

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
  const { gadsService } = resolveSessionServices(sdkContext);

  const query = buildGaqlQuery(input);

  const result = await gadsService.gaqlSearch(
    input.customerId,
    query,
    input.limit,
    undefined,
    context
  );

  return {
    results: result.results as Record<string, any>[],
    totalResults: result.results.length,
    dateRange: input.dateRange,
    timestamp: new Date().toISOString(),
  };
}

export function getInsightsResponseFormatter(result: GetInsightsOutput): any {
  return [
    {
      type: "text" as const,
      text: `Insights (${result.dateRange}): ${result.totalResults} results\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
      label: "Campaign performance last 30 days",
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
  ],
  logic: getInsightsLogic,
  responseFormatter: getInsightsResponseFormatter,
};
