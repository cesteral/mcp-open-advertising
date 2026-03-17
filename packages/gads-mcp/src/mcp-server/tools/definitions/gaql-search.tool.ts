// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "gads_gaql_search";
const TOOL_TITLE = "Google Ads GAQL Search";
const TOOL_DESCRIPTION = `Execute a Google Ads Query Language (GAQL) query against any Google Ads resource. Supports resource fields, segment fields, and metrics with SQL-like syntax. See \`gaql-reference://syntax\` resource for full reference.`;

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
    has_more: z.boolean().describe("Whether more results are available via pagination"),
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
    has_more: !!result.nextPageToken,
    timestamp: new Date().toISOString(),
  };
}

export function gaqlSearchResponseFormatter(result: GAQLSearchOutput): McpTextContent[] {
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
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Campaign performance metrics",
      input: {
        customerId: "1234567890",
        query: "SELECT campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign WHERE segments.date DURING LAST_30_DAYS ORDER BY metrics.impressions DESC LIMIT 50",
      },
    },
    {
      label: "Ad group performance for a campaign",
      input: {
        customerId: "1234567890",
        query: "SELECT ad_group.id, ad_group.name, ad_group.status, metrics.impressions, metrics.conversions FROM ad_group WHERE campaign.id = 123456789 AND segments.date DURING LAST_7_DAYS",
        pageSize: 500,
      },
    },
    {
      label: "Keyword quality scores",
      input: {
        customerId: "1234567890",
        query: "SELECT ad_group_criterion.keyword.text, ad_group_criterion.quality_info.quality_score, ad_group_criterion.quality_info.creative_quality_score FROM keyword_view WHERE campaign.id = 123456789",
      },
    },
  ],
  logic: gaqlSearchLogic,
  responseFormatter: gaqlSearchResponseFormatter,
};