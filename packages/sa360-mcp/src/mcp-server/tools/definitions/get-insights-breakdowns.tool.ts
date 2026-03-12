import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  getInsightsEntityTypeEnum,
  getInsightsQueryResource,
  getInsightsIdField,
  getInsightsNameField,
  type SA360InsightsEntityType,
} from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "sa360_get_insights_breakdowns";
const TOOL_TITLE = "SA360 Performance Insights with Breakdowns";
const TOOL_DESCRIPTION = `Get SA360 performance metrics with dimensional breakdowns (device, date, etc.).

Adds segment dimensions to the query to break down metrics by device, date, network, and more. Each segment becomes a column in the result rows.

**Supported breakdowns:** segments.date, segments.device, segments.ad_network_type, segments.conversion_action, segments.day_of_week, segments.month, segments.quarter, segments.week, segments.year`;

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

export const GetInsightsBreakdownsInputSchema = z
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
    pageToken: z
      .string()
      .optional()
      .describe("Page token for pagination (from previous response)"),
  })
  .describe("Parameters for getting SA360 insights with breakdowns");

export const GetInsightsBreakdownsOutputSchema = z
  .object({
    results: z.array(z.record(z.any())).describe("Insight result rows with breakdown dimensions"),
    totalResults: z.number().describe("Number of results returned"),
    dateRange: z.string().describe("Date range used"),
    breakdowns: z.array(z.string()).describe("Breakdown dimensions used"),
    nextPageToken: z.string().optional().describe("Token to fetch the next page of results"),
    has_more: z.boolean().describe("Whether more results are available via pagination"),
    timestamp: z.string().datetime(),
  })
  .describe("SA360 performance insights with breakdowns");

type GetInsightsBreakdownsInput = z.infer<typeof GetInsightsBreakdownsInputSchema>;
type GetInsightsBreakdownsOutput = z.infer<typeof GetInsightsBreakdownsOutputSchema>;

function buildBreakdownQuery(input: GetInsightsBreakdownsInput): string {
  const entityType = input.entityType as SA360InsightsEntityType;
  const resource = getInsightsQueryResource(entityType);
  const idField = getInsightsIdField(entityType);
  const nameField = getInsightsNameField(entityType);

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
    input.pageToken,
    context
  );

  return {
    results: result.results as Record<string, any>[],
    totalResults: result.results.length,
    dateRange: input.dateRange,
    breakdowns: input.breakdowns,
    nextPageToken: result.nextPageToken,
    has_more: !!result.nextPageToken,
    timestamp: new Date().toISOString(),
  };
}

export function getInsightsBreakdownsResponseFormatter(result: GetInsightsBreakdownsOutput): McpTextContent[] {
  const paginationNote = result.has_more
    ? ` — more pages available (use pageToken: "${result.nextPageToken}")`
    : "";
  return [
    {
      type: "text" as const,
      text: `Insights with breakdowns [${result.breakdowns.join(", ")}] (${result.dateRange}): ${result.totalResults} results${paginationNote}\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
