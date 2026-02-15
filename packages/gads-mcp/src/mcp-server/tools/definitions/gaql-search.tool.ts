import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "../../../utils/internal/request-context.js";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "gads_gaql_search";
const TOOL_TITLE = "Google Ads GAQL Search";
const TOOL_DESCRIPTION = `Execute a Google Ads Query Language (GAQL) query.

GAQL allows querying any Google Ads resource with SQL-like syntax:
  SELECT campaign.id, campaign.name, metrics.impressions
  FROM campaign
  WHERE campaign.status = 'ENABLED'
  ORDER BY metrics.impressions DESC
  LIMIT 100

Supports resource fields, segment fields, and metrics. See \`gaql-reference://syntax\` resource for full reference.`;

export const GAQLSearchInputSchema = z
  .object({
    customerId: z
      .string()
      .min(1)
      .describe("Google Ads customer ID (no dashes, e.g., '1234567890')"),
    query: z
      .string()
      .min(1)
      .describe("GAQL query string (must include SELECT and FROM clauses)"),
    pageSize: z
      .number()
      .min(1)
      .max(10000)
      .optional()
      .default(1000)
      .describe("Number of results per page (default 1000, max 10000)"),
    pageToken: z
      .string()
      .optional()
      .describe("Page token for pagination (from previous response)"),
  })
  .describe("Parameters for executing a GAQL query");

export const GAQLSearchOutputSchema = z
  .object({
    results: z.array(z.record(z.any())).describe("Query result rows"),
    totalResultsCount: z.number().optional().describe("Total results available"),
    nextPageToken: z.string().optional().describe("Token for next page"),
    timestamp: z.string().datetime(),
  })
  .describe("GAQL search results");

type GAQLSearchInput = z.infer<typeof GAQLSearchInputSchema>;
type GAQLSearchOutput = z.infer<typeof GAQLSearchOutputSchema>;

export async function gaqlSearchLogic(
  input: GAQLSearchInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GAQLSearchOutput> {
  const { gadsService } = resolveSessionServices(sdkContext);

  const result = await gadsService.gaqlSearch(
    input.customerId,
    input.query,
    input.pageSize,
    input.pageToken,
    context
  );

  return {
    results: result.results as Record<string, any>[],
    totalResultsCount: result.totalResultsCount,
    nextPageToken: result.nextPageToken,
    timestamp: new Date().toISOString(),
  };
}

export function gaqlSearchResponseFormatter(result: GAQLSearchOutput): any {
  const summary = `GAQL query returned ${result.results.length} results${
    result.totalResultsCount ? ` (${result.totalResultsCount} total)` : ""
  }${result.nextPageToken ? " — more pages available" : ""}`;

  return [
    {
      type: "text" as const,
      text: `${summary}\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const gaqlSearchTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GAQLSearchInputSchema,
  outputSchema: GAQLSearchOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
    idempotentHint: true,
  },
  logic: gaqlSearchLogic,
  responseFormatter: gaqlSearchResponseFormatter,
};
