import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "tiktok_search_targeting";
const TOOL_TITLE = "TikTok Search Targeting Options";
const TOOL_DESCRIPTION = `Search TikTok targeting options by keyword or browse by type.

**Common targeting types:**
- INTEREST_CATEGORY — Interest and hobby categories
- BEHAVIOR — User behavior segments
- HASHTAG — TikTok hashtag interests
- LOCATION — Geographic locations
- LANGUAGE — Language targeting

Use results to populate ad group targeting configurations.`;

export const SearchTargetingInputSchema = z
  .object({
    advertiserId: z
      .string()
      .min(1)
      .describe("TikTok Advertiser ID"),
    targetingType: z
      .string()
      .describe("Type of targeting to search (e.g., INTEREST_CATEGORY, BEHAVIOR, HASHTAG)"),
    query: z
      .string()
      .optional()
      .describe("Search keyword (optional — returns top options if omitted)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20)
      .describe("Maximum number of results (default 20)"),
  })
  .describe("Parameters for searching TikTok targeting options");

export const SearchTargetingOutputSchema = z
  .object({
    results: z.array(z.record(z.any())).describe("Targeting options matching the query"),
    count: z.number().describe("Number of results returned"),
    targetingType: z.string(),
    timestamp: z.string().datetime(),
  })
  .describe("Targeting search result");

type SearchTargetingInput = z.infer<typeof SearchTargetingInputSchema>;
type SearchTargetingOutput = z.infer<typeof SearchTargetingOutputSchema>;

export async function searchTargetingLogic(
  input: SearchTargetingInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<SearchTargetingOutput> {
  const { tiktokService } = resolveSessionServices(sdkContext);

  const results = (await tiktokService.searchTargeting(
    input.targetingType,
    input.query,
    input.limit,
    context
  )) as Record<string, unknown>[] | { list?: Record<string, unknown>[] };

  const list = Array.isArray(results)
    ? results
    : ((results as { list?: Record<string, unknown>[] }).list ?? []);

  return {
    results: list,
    count: list.length,
    targetingType: input.targetingType,
    timestamp: new Date().toISOString(),
  };
}

export function searchTargetingResponseFormatter(result: SearchTargetingOutput): unknown[] {
  return [
    {
      type: "text" as const,
      text: `Found ${result.count} ${result.targetingType} targeting options\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const searchTargetingTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: SearchTargetingInputSchema,
  outputSchema: SearchTargetingOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Search interest categories",
      input: {
        advertiserId: "1234567890",
        targetingType: "INTEREST_CATEGORY",
        query: "gaming",
        limit: 20,
      },
    },
    {
      label: "Browse behavior segments",
      input: {
        advertiserId: "1234567890",
        targetingType: "BEHAVIOR",
        limit: 30,
      },
    },
  ],
  logic: searchTargetingLogic,
  responseFormatter: searchTargetingResponseFormatter,
};
