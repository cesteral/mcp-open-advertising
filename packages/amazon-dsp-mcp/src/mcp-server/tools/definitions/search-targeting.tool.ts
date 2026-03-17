// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "amazon_dsp_search_targeting";
const TOOL_TITLE = "Amazon DSP Search Audience Segments";
const TOOL_DESCRIPTION = `Search Amazon DSP audience segments by name.

Returns available audience segments from the Amazon DSP Advertising API
(\`GET /dsp/audienceSegments\`). Use the segment IDs in line item targeting configurations.

**Examples of segment types available:**
- First-party audiences (advertiser remarketing lists)
- Amazon-owned audiences (in-market, lifestyle segments)
- Third-party data provider segments`;

export const SearchTargetingInputSchema = z
  .object({
    profileId: z
      .string()
      .min(1)
      .describe("Amazon DSP Advertiser ID"),
    query: z
      .string()
      .optional()
      .describe("Search keyword to filter segments by name (optional — returns top segments if omitted)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20)
      .describe("Maximum number of results (default 20)"),
  })
  .describe("Parameters for searching Amazon DSP audience segments");

export const SearchTargetingOutputSchema = z
  .object({
    results: z.array(z.record(z.any())).describe("Audience segments matching the query"),
    count: z.number().describe("Number of results returned"),
    timestamp: z.string().datetime(),
  })
  .describe("Audience segment search result");

type SearchTargetingInput = z.infer<typeof SearchTargetingInputSchema>;
type SearchTargetingOutput = z.infer<typeof SearchTargetingOutputSchema>;

export async function searchTargetingLogic(
  input: SearchTargetingInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<SearchTargetingOutput> {
  const { amazonDspService } = resolveSessionServices(sdkContext);

  const results = (await amazonDspService.searchAudienceSegments(
    input.query,
    input.limit,
    context
  )) as Record<string, unknown>[] | { audienceSegments?: Record<string, unknown>[] };

  const list = Array.isArray(results)
    ? results
    : ((results as { audienceSegments?: Record<string, unknown>[] }).audienceSegments ?? []);

  return {
    results: list,
    count: list.length,
    timestamp: new Date().toISOString(),
  };
}

export function searchTargetingResponseFormatter(result: SearchTargetingOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Found ${result.count} audience segments\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
      label: "Search for gaming audience segments",
      input: {
        profileId: "1234567890",
        query: "gaming",
        limit: 20,
      },
    },
    {
      label: "Browse all available audience segments",
      input: {
        profileId: "1234567890",
        limit: 30,
      },
    },
  ],
  logic: searchTargetingLogic,
  responseFormatter: searchTargetingResponseFormatter,
};
