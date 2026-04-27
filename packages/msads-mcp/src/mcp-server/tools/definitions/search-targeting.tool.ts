// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";

const TOOL_NAME = "msads_search_targeting";
const TOOL_TITLE = "List Microsoft Ads Targeting Options";
const TOOL_DESCRIPTION = `List the enumerated targeting option values supported by Microsoft Advertising.

Supported targeting types:
- age: List available age range targets
- gender: List available gender targets
- device: List available device targets

Note: location targets are not searchable via the Microsoft Advertising REST API. Use the Campaign Management GetGeoLocationsFileUrl operation to download the full geo-location reference file.`;

export const SearchTargetingInputSchema = z
  .object({
    targetingType: z.enum(["age", "gender", "device"]).describe("Type of targeting to list"),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(25)
      .describe("Maximum number of results to return"),
  })
  .describe("Parameters for listing targeting options");

export const SearchTargetingOutputSchema = z
  .object({
    targetingType: z.string(),
    results: z.array(z.record(z.any())),
    totalResults: z.number(),
    timestamp: z.string().datetime(),
  })
  .describe("Targeting options result");

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
  _context: RequestContext,
  _sdkContext?: SdkContext
): Promise<SearchTargetingOutput> {
  let results: Record<string, unknown>[];

  switch (input.targetingType) {
    case "age":
      results = AGE_RANGES;
      break;
    case "gender":
      results = GENDERS;
      break;
    case "device":
      results = DEVICE_TYPES;
      break;
    default:
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `Unsupported targeting type: ${input.targetingType satisfies never}`
      );
  }

  return {
    targetingType: input.targetingType,
    results: results.slice(0, input.maxResults),
    totalResults: results.length,
    timestamp: new Date().toISOString(),
  };
}

export function searchTargetingResponseFormatter(result: SearchTargetingOutput): McpTextContent[] {
  const header = `Available ${result.targetingType} targeting options (${result.totalResults})`;
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
      label: "List available age range targets",
      input: { targetingType: "age" },
    },
    {
      label: "List available device targets",
      input: { targetingType: "device" },
    },
  ],
  logic: searchTargetingLogic,
  responseFormatter: searchTargetingResponseFormatter,
};
