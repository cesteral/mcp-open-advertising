import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "sa360_get_insights_breakdowns";
const TOOL_TITLE = "SA360 Performance Insights with Breakdowns";
const TOOL_DESCRIPTION = `Get SA360 performance metrics with dimensional breakdowns (device, date, etc.).

Adds segment dimensions to the query to break down metrics by device, date, network, and more. Each segment becomes a column in the result rows.

**Supported breakdowns:** segments.date, segments.device, segments.ad_network_type, segments.conversion_action, segments.day_of_week, segments.month, segments.quarter, segments.week, segments.year`;

const ENTITY_TYPE_ENUM = ["campaign", "adGroup", "adGroupAd", "adGroupCriterion"] as const;
const METRIC_NAME_PATTERN = /^(metrics\.)?[a-z_][a-z0-9_]*$/;
const SEGMENT_NAME_PATTERN = /^(segments\.)?[a-z_][a-z0-9_.]*$/;

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
];

const QUERY_RESOURCE_MAP: Record<string, string> = {
  campaign: "campaign",
  adGroup: "ad_group",
  adGroupAd: "ad_group_ad",
  adGroupCriterion: "ad_group_criterion",
};

const ENTITY_ID_FIELD_MAP: Record<string, string> = {
  campaign: "campaign.id",
  adGroup: "ad_group.id",
  adGroupAd: "ad_group_ad.ad.id",
  adGroupCriterion: "ad_group_criterion.criterion_id",
};

const ENTITY_NAME_FIELD_MAP: Record<string, string> = {
  campaign: "campaign.name",
  adGroup: "ad_group.name",
  adGroupAd: "ad_group_ad.ad.name",
  adGroupCriterion: "ad_group_criterion.keyword.text",
};

export const GetInsightsBreakdownsInputSchema = z
  .object({
    customerId: z
      .string()
      .regex(/^\d+$/, "customerId must be numeric")
      .describe("SA360 customer ID (no dashes)"),
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
    breakdowns: z
      .array(
        z.string().regex(SEGMENT_NAME_PATTERN, "breakdowns must be segment names like 'date' or 'segments.device'")
      )
      .min(1)
      .describe("Segment dimensions to break down by (e.g., ['segments.date', 'segments.device'])"),
    metrics: z
      .array(
        z.string().regex(METRIC_NAME_PATTERN, "metrics must be metric names like 'clicks' or 'metrics.clicks'")
      )
      .optional()
      .describe("Metrics to include (defaults to impressions, clicks, cost_micros, conversions)"),
    limit: z
      .number()
      .min(1)
      .max(10000)
      .optional()
      .default(100)
      .describe("Max results to return (default 100)"),
  })
  .describe("Parameters for getting SA360 insights with breakdowns");

export const GetInsightsBreakdownsOutputSchema = z
  .object({
    results: z.array(z.record(z.any())).describe("Insight result rows with breakdown dimensions"),
    totalResults: z.number().describe("Number of results returned"),
    dateRange: z.string().describe("Date range used"),
    breakdowns: z.array(z.string()).describe("Breakdown dimensions used"),
    timestamp: z.string().datetime(),
  })
  .describe("SA360 performance insights with breakdowns");

type GetInsightsBreakdownsInput = z.infer<typeof GetInsightsBreakdownsInputSchema>;
type GetInsightsBreakdownsOutput = z.infer<typeof GetInsightsBreakdownsOutputSchema>;

function buildBreakdownQuery(input: GetInsightsBreakdownsInput): string {
  const resource = QUERY_RESOURCE_MAP[input.entityType];
  const idField = ENTITY_ID_FIELD_MAP[input.entityType];
  const nameField = ENTITY_NAME_FIELD_MAP[input.entityType];

  const metricFields =
    input.metrics && input.metrics.length > 0
      ? input.metrics.map((m) => (m.startsWith("metrics.") ? m : `metrics.${m}`))
      : DEFAULT_METRICS;

  const segmentFields = input.breakdowns.map((b) =>
    b.startsWith("segments.") ? b : `segments.${b}`
  );

  const selectFields = [idField, nameField, ...segmentFields, ...metricFields].join(", ");

  const whereClauses: string[] = [
    `segments.date DURING ${input.dateRange}`,
  ];

  if (input.entityId) {
    whereClauses.push(`${idField} = ${input.entityId}`);
  }

  return `SELECT ${selectFields} FROM ${resource} WHERE ${whereClauses.join(" AND ")} ORDER BY metrics.impressions DESC LIMIT ${input.limit}`;
}

export async function getInsightsBreakdownsLogic(
  input: GetInsightsBreakdownsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetInsightsBreakdownsOutput> {
  const { sa360Service } = resolveSessionServices(sdkContext);

  const query = buildBreakdownQuery(input);

  const result = await sa360Service.sa360Search(
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
    breakdowns: input.breakdowns,
    timestamp: new Date().toISOString(),
  };
}

export function getInsightsBreakdownsResponseFormatter(result: GetInsightsBreakdownsOutput): any {
  return [
    {
      type: "text" as const,
      text: `Insights with breakdowns [${result.breakdowns.join(", ")}] (${result.dateRange}): ${result.totalResults} results\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getInsightsBreakdownsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetInsightsBreakdownsInputSchema,
  outputSchema: GetInsightsBreakdownsOutputSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Campaign performance by device",
      input: {
        customerId: "1234567890",
        entityType: "campaign",
        dateRange: "LAST_30_DAYS",
        breakdowns: ["segments.device"],
      },
    },
    {
      label: "Daily campaign performance",
      input: {
        customerId: "1234567890",
        entityType: "campaign",
        entityId: "9876543210",
        dateRange: "LAST_7_DAYS",
        breakdowns: ["segments.date"],
        metrics: ["impressions", "clicks", "cost_micros", "conversions"],
      },
    },
  ],
  logic: getInsightsBreakdownsLogic,
  responseFormatter: getInsightsBreakdownsResponseFormatter,
};
