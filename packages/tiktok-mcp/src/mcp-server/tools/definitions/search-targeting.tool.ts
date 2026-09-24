// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "tiktok_search_targeting";
const TOOL_TITLE = "TikTok Search Targeting Options";
const TOOL_DESCRIPTION = `Search TikTok location targeting tags (countries, regions, cities, DMAs, zip/postal codes) using TikTok's \`/tool/targeting/search/\` endpoint.

TikTok requires \`placements\` and \`objectiveType\` for every search. \`searchType\` selects the mode:
- \`FUZZY_SEARCH\` (default) — one keyword, up to 100 results, any country
- \`BATCH_REGION_SEARCH\` — up to 1,000 keywords, US/CA locations (set \`regionCodes\`)
- \`BATCH_ZIPCODE_SEARCH\` — up to 1,000 exact zip/postal codes, US/CA (set \`regionCodes\`)

For ISP tags, languages, carriers, interest categories and device models use \`tiktok_get_targeting_options\`.`;

const SEARCH_TYPES = ["FUZZY_SEARCH", "BATCH_REGION_SEARCH", "BATCH_ZIPCODE_SEARCH"] as const;
const GEO_TYPES = ["COUNTRY", "PROVINCE", "CITY", "DISTRICT", "DMA", "ZIP_CODE"] as const;

export const SearchTargetingInputSchema = z
  .object({
    advertiserId: z.string().min(1).describe("TikTok Advertiser ID"),
    query: z
      .union([z.string().min(1), z.array(z.string().min(1)).min(1).max(1000)])
      .describe(
        "Keyword(s) to search, sent as TikTok's `keywords` array. One keyword for FUZZY_SEARCH; up to 1,000 for the batch search types."
      ),
    searchType: z
      .enum(SEARCH_TYPES)
      .optional()
      .default("FUZZY_SEARCH")
      .describe("TikTok search_type (default FUZZY_SEARCH)"),
    placements: z
      .array(z.string())
      .min(1)
      .describe("Placements (required by TikTok), e.g. ['PLACEMENT_TIKTOK']"),
    objectiveType: z
      .string()
      .min(1)
      .describe("Campaign objective (required by TikTok), e.g. TRAFFIC, REACH or APP_PROMOTION"),
    promotionType: z
      .string()
      .optional()
      .describe(
        "Promotion type; TikTok requires it unless objectiveType is REACH, VIDEO_VIEWS or ENGAGEMENT"
      ),
    operatingSystem: z.enum(["ANDROID", "IOS"]).optional().describe("Optional OS filter"),
    geoTypes: z.array(z.enum(GEO_TYPES)).optional().describe("Filter results by location type"),
    regionCodes: z
      .array(z.string())
      .optional()
      .describe(
        "Country/region codes to filter by; required ('US' or 'CA') for the batch search types"
      ),
  })
  .refine(
    (d) => d.searchType !== "FUZZY_SEARCH" || !Array.isArray(d.query) || d.query.length === 1,
    {
      message: "FUZZY_SEARCH accepts exactly one keyword",
      path: ["query"],
    }
  )
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
  const { tiktokService, boundAdvertiserId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.advertiserId, boundAdvertiserId, "advertiserId");

  // Body per TikTok's tool_targeting_search spec: required
  // [advertiser_id, placements, objective_type, keywords, search_type]
  // (advertiser_id is injected by the HTTP client).
  const keywords = Array.isArray(input.query) ? input.query : [input.query];
  const results = (await tiktokService.searchTargeting(
    {
      keywords,
      search_type: input.searchType,
      placements: input.placements,
      objective_type: input.objectiveType,
      ...(input.promotionType ? { promotion_type: input.promotionType } : {}),
      ...(input.operatingSystem ? { operating_system: input.operatingSystem } : {}),
      ...(input.geoTypes ? { geo_types: input.geoTypes } : {}),
      ...(input.regionCodes ? { region_codes: input.regionCodes } : {}),
    },
    context
  )) as { targeting_tag_list?: Record<string, unknown>[] } | undefined;

  // The spec's response rule maps results to `targeting_tag_list`.
  const list = results?.targeting_tag_list ?? [];

  return {
    results: list,
    count: list.length,
    targetingType: input.searchType,
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
      label: "Fuzzy-search a city",
      input: {
        advertiserId: "1234567890",
        query: "stockholm",
        placements: ["PLACEMENT_TIKTOK"],
        objectiveType: "REACH",
      },
    },
    {
      label: "Batch-search US zip codes",
      input: {
        advertiserId: "1234567890",
        query: ["10001", "10002"],
        searchType: "BATCH_ZIPCODE_SEARCH",
        placements: ["PLACEMENT_TIKTOK"],
        objectiveType: "REACH",
        regionCodes: ["US"],
      },
    },
  ],
  logic: searchTargetingLogic,
  responseFormatter: searchTargetingResponseFormatter,
};
