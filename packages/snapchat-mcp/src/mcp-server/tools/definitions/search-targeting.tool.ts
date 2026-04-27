// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "snapchat_search_targeting";
const TOOL_TITLE = "Snapchat Search Targeting Options";
const TOOL_DESCRIPTION = `Search documented Snapchat targeting options by keyword.

**Common targeting types:**
- geo_country
- geo_region
- geo_metro
- geo_postal_code
- interests_slc
- interests_vac
- interests_shp

This tool fetches a documented targeting endpoint and filters the results client-side.`;

export const SearchTargetingInputSchema = z
  .object({
    targetingType: z
      .enum([
        "geo_country",
        "geo_region",
        "geo_metro",
        "geo_postal_code",
        "interests_slc",
        "interests_vac",
        "interests_shp",
      ])
      .describe("Documented targeting endpoint to query and filter"),
    countryCode: z
      .string()
      .optional()
      .describe("ISO alpha-2 country code required for country-specific targeting types"),
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
  .describe("Parameters for searching Snapchat targeting options");

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
  const { snapchatService } = resolveSessionServices(sdkContext);

  const results = (await snapchatService.searchTargeting(
    input.targetingType,
    input.countryCode,
    input.query,
    input.limit,
    context
  )) as { results: Record<string, unknown>[] };

  return {
    results: results.results,
    count: results.results.length,
    targetingType: input.targetingType,
    timestamp: new Date().toISOString(),
  };
}

export function searchTargetingResponseFormatter(result: SearchTargetingOutput): McpTextContent[] {
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
        targetingType: "interests_slc",
        countryCode: "us",
        query: "gaming",
        limit: 20,
      },
    },
    {
      label: "Browse UK metro targeting",
      input: {
        targetingType: "geo_metro",
        countryCode: "gb",
        limit: 30,
      },
    },
  ],
  logic: searchTargetingLogic,
  responseFormatter: searchTargetingResponseFormatter,
};
