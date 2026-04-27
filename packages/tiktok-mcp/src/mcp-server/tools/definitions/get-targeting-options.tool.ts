// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "tiktok_get_targeting_options";
const TOOL_TITLE = "Get TikTok Targeting Options";
const TOOL_DESCRIPTION = `Browse available TikTok targeting metadata using official \`/tool/*\` endpoints.

Use this to discover valid targeting values before creating or updating ad groups.
This tool dispatches to the documented TikTok list endpoints instead of the older
generic targeting routes.

**Supported option types:** ACTION_CATEGORY, CARRIER, DEVICE_MODEL, INTEREST_CATEGORY,
INTEREST_KEYWORD, ISP, LANGUAGE, LOCATION`;

export const GetTargetingOptionsInputSchema = z
  .object({
    advertiserId: z.string().min(1).describe("TikTok Advertiser ID"),
    optionType: z
      .enum([
        "ACTION_CATEGORY",
        "CARRIER",
        "DEVICE_MODEL",
        "INTEREST_CATEGORY",
        "INTEREST_KEYWORD",
        "ISP",
        "LANGUAGE",
        "LOCATION",
      ])
      .describe("Which official TikTok targeting endpoint to query"),
    keyword: z.string().optional().describe("Keyword for INTEREST_KEYWORD lookups"),
    placements: z
      .array(z.string())
      .optional()
      .describe("Placements required by LOCATION lookups, e.g. ['PLACEMENT_TIKTOK']"),
    objectiveType: z
      .string()
      .optional()
      .describe("Objective type used by LOCATION lookups, e.g. TRAFFIC or APP_PROMOTION"),
    promotionType: z
      .string()
      .optional()
      .describe("Promotion type used by LOCATION or ISP lookups when required"),
    operatingSystem: z
      .enum(["ANDROID", "IOS"])
      .optional()
      .describe("Optional OS filter used by LOCATION lookups"),
    locationIds: z.array(z.string()).optional().describe("Location IDs used by ISP lookups"),
    scene: z
      .enum(["ISP"])
      .optional()
      .describe("Scene used by tool_targeting_list. Currently only ISP is supported here."),
    specialIndustries: z
      .array(z.string())
      .optional()
      .describe("Special industries used by ACTION_CATEGORY lookups"),
  })
  .describe("Parameters for browsing TikTok targeting options");

export const GetTargetingOptionsOutputSchema = z
  .object({
    options: z.record(z.any()).describe("Available targeting options"),
    timestamp: z.string().datetime(),
  })
  .describe("Targeting options result");

type GetTargetingOptionsInput = z.infer<typeof GetTargetingOptionsInputSchema>;
type GetTargetingOptionsOutput = z.infer<typeof GetTargetingOptionsOutputSchema>;

export async function getTargetingOptionsLogic(
  input: GetTargetingOptionsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetTargetingOptionsOutput> {
  const { tiktokService } = resolveSessionServices(sdkContext);

  const options = (await tiktokService.getTargetingOptions(
    input.optionType,
    {
      ...(input.keyword ? { keyword: input.keyword } : {}),
      ...(input.placements ? { placements: input.placements } : {}),
      ...(input.objectiveType ? { objective_type: input.objectiveType } : {}),
      ...(input.promotionType ? { promotion_type: input.promotionType } : {}),
      ...(input.operatingSystem ? { operating_system: input.operatingSystem } : {}),
      ...(input.locationIds ? { location_ids: input.locationIds } : {}),
      ...(input.scene ? { scene: input.scene } : {}),
      ...(input.specialIndustries ? { special_industries: input.specialIndustries } : {}),
    },
    context
  )) as Record<string, unknown>;

  return {
    options,
    timestamp: new Date().toISOString(),
  };
}

export function getTargetingOptionsResponseFormatter(
  result: GetTargetingOptionsOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `TikTok targeting options:\n${JSON.stringify(result.options, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getTargetingOptionsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetTargetingOptionsInputSchema,
  outputSchema: GetTargetingOptionsOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Get languages",
      input: {
        advertiserId: "1234567890",
        optionType: "LANGUAGE",
      },
    },
    {
      label: "Get locations for a traffic campaign",
      input: {
        advertiserId: "1234567890",
        optionType: "LOCATION",
        placements: ["PLACEMENT_TIKTOK"],
        objectiveType: "TRAFFIC",
      },
    },
  ],
  logic: getTargetingOptionsLogic,
  responseFormatter: getTargetingOptionsResponseFormatter,
};
