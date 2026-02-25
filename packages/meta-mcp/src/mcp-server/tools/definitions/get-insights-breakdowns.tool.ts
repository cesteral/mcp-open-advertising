import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "../../../utils/internal/request-context.js";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "meta_get_insights_breakdowns";
const TOOL_TITLE = "Get Meta Ads Insights with Breakdowns";
const TOOL_DESCRIPTION = `Get performance insights broken down by dimension (age, gender, country, device, etc.).

**Common breakdowns:** age, gender, country, region, dma, device_platform, platform_position, publisher_platform

**Valid combinations:** age+gender OK, country+region NOT OK (same dimension).

**Action attribution windows:** 1d_click, 7d_click, 1d_view, 7d_view

**Gotchas:**
- Not all breakdown combinations are valid.
- Some breakdowns dramatically increase result volume.
- Use \`limit\` to control page size.`;

export const GetInsightsBreakdownsInputSchema = z
  .object({
    entityId: z
      .string()
      .min(1)
      .describe("Entity ID to get insights for"),
    breakdowns: z
      .array(z.string())
      .min(1)
      .describe("Breakdown dimensions (e.g., ['age', 'gender'])"),
    fields: z
      .array(z.string())
      .optional()
      .describe("Metrics to return"),
    datePreset: z
      .string()
      .optional()
      .describe("Date preset (last_7d, last_30d, etc.)"),
    timeRange: z
      .object({
        since: z.string(),
        until: z.string(),
      })
      .optional()
      .describe("Custom date range"),
    timeIncrement: z
      .string()
      .optional()
      .describe("Time granularity"),
    level: z
      .string()
      .optional()
      .describe("Aggregation level"),
    actionAttributionWindows: z
      .array(z.string())
      .optional()
      .describe("Attribution windows (e.g., ['1d_click', '7d_click'])"),
    limit: z
      .number()
      .min(1)
      .max(500)
      .optional()
      .describe("Results per page"),
    after: z
      .string()
      .optional()
      .describe("Cursor for next page"),
  })
  .describe("Parameters for getting Meta Ads insights with breakdowns");

export const GetInsightsBreakdownsOutputSchema = z
  .object({
    data: z.array(z.record(z.any())).describe("Breakdown data rows"),
    nextCursor: z.string().optional(),
    totalCount: z.number(),
    timestamp: z.string().datetime(),
  })
  .describe("Breakdown insights result");

type GetInsightsBreakdownsInput = z.infer<typeof GetInsightsBreakdownsInputSchema>;
type GetInsightsBreakdownsOutput = z.infer<typeof GetInsightsBreakdownsOutputSchema>;

export async function getInsightsBreakdownsLogic(
  input: GetInsightsBreakdownsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetInsightsBreakdownsOutput> {
  const { metaInsightsService } = resolveSessionServices(sdkContext);

  const result = await metaInsightsService.getInsightsBreakdowns(
    input.entityId,
    {
      breakdowns: input.breakdowns,
      fields: input.fields,
      datePreset: input.datePreset,
      timeRange: input.timeRange,
      timeIncrement: input.timeIncrement,
      level: input.level,
      actionAttributionWindows: input.actionAttributionWindows,
      limit: input.limit,
      after: input.after,
    },
    context
  );

  return {
    data: result.data as Record<string, unknown>[],
    nextCursor: result.nextCursor,
    totalCount: (result.data as unknown[]).length,
    timestamp: new Date().toISOString(),
  };
}

export function getInsightsBreakdownsResponseFormatter(result: GetInsightsBreakdownsOutput): unknown[] {
  const summary = `Retrieved ${result.totalCount} breakdown row(s)`;
  const data = result.totalCount > 0
    ? `\n\n${JSON.stringify(result.data, null, 2)}`
    : "\n\nNo data available";
  const pagination = result.nextCursor
    ? `\n\nMore results available. Use after: "${result.nextCursor}"`
    : "";

  return [
    {
      type: "text" as const,
      text: `${summary}${data}${pagination}\n\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Get age and gender breakdown for a campaign",
      input: {
        entityId: "23456789012345",
        breakdowns: ["age", "gender"],
        datePreset: "last_30d",
      },
    },
    {
      label: "Get country breakdown with attribution",
      input: {
        entityId: "act_123456789",
        breakdowns: ["country"],
        fields: ["impressions", "clicks", "spend", "actions"],
        datePreset: "last_7d",
        actionAttributionWindows: ["1d_click", "7d_click"],
        level: "campaign",
      },
    },
  ],
  logic: getInsightsBreakdownsLogic,
  responseFormatter: getInsightsBreakdownsResponseFormatter,
};
