// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_search_targeting";
const TOOL_TITLE = "Search Microsoft Ads Targeting Options";
const TOOL_DESCRIPTION = `Search for available targeting options in Microsoft Advertising.

Supported targeting types:
- location: Search locations by name (cities, states, countries)
- age: List available age range targets
- gender: List available gender targets
- device: List available device targets`;

export const SearchTargetingInputSchema = z
  .object({
    targetingType: z
      .enum(["location", "age", "gender", "device"])
      .describe("Type of targeting to search"),
    query: z
      .string()
      .optional()
      .describe("Search query (required for location targeting)"),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(25)
      .describe("Maximum number of results to return"),
  })
  .describe("Parameters for searching targeting options");

export const SearchTargetingOutputSchema = z
  .object({
    targetingType: z.string(),
    query: z.string().optional(),
    results: z.array(z.record(z.any())),
    totalResults: z.number(),
    timestamp: z.string().datetime(),
  })
  .describe("Targeting search result");

type SearchTargetingInput = z.infer<typeof SearchTargetingInputSchema>;
type SearchTargetingOutput = z.infer<typeof SearchTargetingOutputSchema>;

const AGE_RANGES = [
  { Id: "EighteenToTwentyFour", Name: "18-24" },
  { Id: "TwentyFiveToThirtyFour", Name: "25-34" },
  { Id: "ThirtyFiveToFortyNine", Name: "35-49" },
  { Id: "FiftyToSixtyFour", Name: "50-64" },
  { Id: "SixtyFiveAndAbove", Name: "65+" },
];

const GENDERS = [
  { Id: "Male", Name: "Male" },
  { Id: "Female", Name: "Female" },
];

const DEVICE_TYPES = [
  { Id: "Computers", Name: "Computers" },
  { Id: "Smartphones", Name: "Smartphones" },
  { Id: "Tablets", Name: "Tablets" },
];

export async function searchTargetingLogic(
  input: SearchTargetingInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<SearchTargetingOutput> {
  const { msadsService } = resolveSessionServices(sdkContext);

  let results: Record<string, unknown>[];

  switch (input.targetingType) {
    case "location": {
      if (!input.query) {
        throw new Error("query is required for location targeting search");
      }
      const response = (await msadsService.executeReadOperation(
        "/LocationTarget/Search",
        {
          Query: input.query,
          MaxResults: input.maxResults,
        },
        context
      )) as Record<string, unknown>;

      results = (response.Locations as Record<string, unknown>[]) ?? [];
      break;
    }
    case "age":
      results = AGE_RANGES;
      break;
    case "gender":
      results = GENDERS;
      break;
    case "device":
      results = DEVICE_TYPES;
      break;
  }

  return {
    targetingType: input.targetingType,
    query: input.query,
    results: results.slice(0, input.maxResults),
    totalResults: results.length,
    timestamp: new Date().toISOString(),
  };
}

export function searchTargetingResponseFormatter(result: SearchTargetingOutput): McpTextContent[] {
  const header = result.query
    ? `Found ${result.totalResults} ${result.targetingType} results for "${result.query}"`
    : `Available ${result.targetingType} targeting options (${result.totalResults})`;

  return [
    {
      type: "text" as const,
      text: `${header}\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
      label: "Search for location targeting",
      input: { targetingType: "location", query: "New York" },
    },
    {
      label: "List available age range targets",
      input: { targetingType: "age" },
    },
  ],
  logic: searchTargetingLogic,
  responseFormatter: searchTargetingResponseFormatter,
};
