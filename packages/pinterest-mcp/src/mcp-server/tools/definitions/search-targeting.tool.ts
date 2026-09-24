// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";
import { PINTEREST_TARGETING_TYPES } from "../../../services/pinterest/pinterest-service.js";

const TOOL_NAME = "pinterest_search_targeting";
const TOOL_TITLE = "Pinterest Search Targeting Options";
const TOOL_DESCRIPTION = `Search Pinterest targeting options of one type by keyword, or browse them.

Reads \`GET /v5/resources/targeting/{targeting_type}\`. That endpoint has no search or count parameter, so the keyword match (case-insensitive, on option id and name) and the limit are applied by this server over the full option list.

**Targeting types:** ${PINTEREST_TARGETING_TYPES.join(", ")}

Use the returned ids in an ad group's \`targeting_spec\` (e.g. \`LOCATION\`, \`INTEREST\`).`;

export const SearchTargetingInputSchema = z
  .object({
    adAccountId: z.string().min(1).describe("Pinterest Advertiser ID"),
    targetingType: z
      .enum(PINTEREST_TARGETING_TYPES)
      .describe("Pinterest targeting type to search (e.g., INTEREST, LOCATION, GEO)"),
    query: z
      .string()
      .optional()
      .describe(
        "Keyword matched case-insensitively against option ids and names (optional — returns the first options if omitted)"
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20)
      .describe("Maximum number of results (default 20)"),
  })
  .describe("Parameters for searching Pinterest targeting options");

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
  const { pinterestService, boundAdAccountId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.adAccountId, boundAdAccountId, "adAccountId");

  const list = await pinterestService.searchTargeting(
    input.targetingType,
    input.query,
    input.limit,
    { adAccountId: input.adAccountId },
    context
  );

  return {
    results: list,
    count: list.length,
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
      label: "Search interests",
      input: {
        adAccountId: "1234567890",
        targetingType: "INTEREST",
        query: "gaming",
        limit: 20,
      },
    },
    {
      label: "Browse locations",
      input: {
        adAccountId: "1234567890",
        targetingType: "LOCATION",
        limit: 30,
      },
    },
  ],
  logic: searchTargetingLogic,
  responseFormatter: searchTargetingResponseFormatter,
};
