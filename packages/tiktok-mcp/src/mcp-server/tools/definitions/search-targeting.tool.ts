// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "tiktok_search_targeting";
const TOOL_TITLE = "TikTok Search Targeting Options";
const TOOL_DESCRIPTION = `Search TikTok location-style targeting tags using TikTok's official \`/tool/targeting/search/\` endpoint.

This endpoint is for targeting-tag discovery, not general interest/language browsing.
Use \`tiktok_get_targeting_options\` for official list endpoints such as languages, carriers,
interest categories, device models, and geographic options.

**Common scenes:**
- \`GEO\` — Geo targeting tags such as regions, zip codes, or postal codes
- \`ISP\` — Internet service provider targeting tags`;

export const SearchTargetingInputSchema = z
  .object({
    advertiserId: z
      .string()
      .min(1)
      .describe("TikTok Advertiser ID"),
    query: z
      .string()
      .min(1)
      .describe("Search keyword passed to TikTok targeting search"),
    scene: z
      .enum(["GEO", "ISP"])
      .optional()
      .default("GEO")
      .describe("Targeting tag scene to search"),
    placements: z
      .array(z.string())
      .optional()
      .describe("Placements required by TikTok for GEO searches, e.g. ['PLACEMENT_TIKTOK']"),
    objectiveType: z
      .string()
      .optional()
      .describe("Objective type required by TikTok for GEO searches, e.g. TRAFFIC or APP_PROMOTION"),
    promotionType: z
      .string()
      .optional()
      .describe("Promotion type used for GEO searches when required by the selected objective"),
    operatingSystem: z
      .enum(["ANDROID", "IOS"])
      .optional()
      .describe("Optional OS filter for GEO searches"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .default(20)
      .describe("Maximum number of results to request from TikTok"),
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
    {
      keyword: input.query,
      scene: input.scene,
      ...(input.placements ? { placements: input.placements } : {}),
      ...(input.objectiveType ? { objective_type: input.objectiveType } : {}),
      ...(input.promotionType ? { promotion_type: input.promotionType } : {}),
      ...(input.operatingSystem ? { operating_system: input.operatingSystem } : {}),
      page_size: input.limit,
    },
    context
  )) as Record<string, unknown>[] | { list?: Record<string, unknown>[] };

  const list = Array.isArray(results)
    ? results
    : ((results as { list?: Record<string, unknown>[] }).list ?? []);

  return {
    results: list,
    count: list.length,
    targetingType: input.scene,
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
      label: "Search geo targeting tags",
      input: {
        advertiserId: "1234567890",
        query: "stockholm",
        scene: "GEO",
        placements: ["PLACEMENT_TIKTOK"],
        objectiveType: "TRAFFIC",
        limit: 20,
      },
    },
    {
      label: "Search ISP targeting tags",
      input: {
        advertiserId: "1234567890",
        query: "telia",
        scene: "ISP",
        limit: 30,
      },
    },
  ],
  logic: searchTargetingLogic,
  responseFormatter: searchTargetingResponseFormatter,
};
