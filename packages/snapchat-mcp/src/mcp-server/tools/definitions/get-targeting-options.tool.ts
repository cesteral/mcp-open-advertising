// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  PaginationOutputSchema,
  buildPaginationOutput,
  formatPaginationHint,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "snapchat_get_targeting_options";
const TOOL_TITLE = "Get Snapchat Targeting Options";
const TOOL_DESCRIPTION = `Browse available Snapchat targeting options from documented targeting endpoints.

Use this to discover valid country support, geo, and interest values before creating or updating ad groups.

**Supported targeting types:** country_support, geo_country, geo_region, geo_metro, geo_postal_code, interests_slc, interests_vac, interests_shp

Interest and postal-code endpoints page — pass the \`cursor\` from \`pagination.nextCursor\` to fetch the next page.`;

export const GetTargetingOptionsInputSchema = z
  .object({
    targetingType: z
      .enum([
        "country_support",
        "geo_country",
        "geo_region",
        "geo_metro",
        "geo_postal_code",
        "interests_slc",
        "interests_vac",
        "interests_shp",
      ])
      .optional()
      .default("country_support")
      .describe("Documented Snapchat targeting endpoint to query"),
    countryCode: z
      .string()
      .optional()
      .describe("ISO alpha-2 country code required for country-specific targeting types"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(10000)
      .optional()
      .default(50)
      .describe("Maximum number of options to request where Snapchat supports limits"),
    cursor: z
      .string()
      .optional()
      .describe(
        "Pagination cursor (the `next_link` URL from a prior page's pagination.nextCursor)"
      ),
  })
  .describe("Parameters for browsing Snapchat targeting options");

export const GetTargetingOptionsOutputSchema = z
  .object({
    options: z.record(z.any()).describe("Available targeting options"),
    pagination: PaginationOutputSchema,
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
  const { snapchatService } = resolveSessionServices(sdkContext);

  const options = (await snapchatService.getTargetingOptions(
    input.targetingType,
    input.countryCode,
    input.limit,
    input.cursor,
    context
  )) as { results: Record<string, unknown>[]; nextCursor?: string };

  return {
    options: { results: options.results },
    pagination: buildPaginationOutput({
      nextCursor: options.nextCursor ?? null,
      pageSize: options.results.length,
      nextPageInputKey: "cursor",
    }),
    timestamp: new Date().toISOString(),
  };
}

export function getTargetingOptionsResponseFormatter(
  result: GetTargetingOptionsOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Snapchat targeting options:\n${JSON.stringify(result.options, null, 2)}${formatPaginationHint(result.pagination)}\n\nTimestamp: ${result.timestamp}`,
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
      label: "Get all targeting options",
      input: {
        targetingType: "country_support",
        countryCode: "us",
      },
    },
    {
      label: "Get US Snap Lifestyle Categories",
      input: {
        targetingType: "interests_slc",
        countryCode: "us",
        limit: 100,
      },
    },
    {
      label: "Fetch the next page of interests via cursor",
      input: {
        targetingType: "interests_slc",
        countryCode: "us",
        cursor: "https://adsapi.snapchat.com/v1/targeting/interests/slc?cursor=abc123",
      },
    },
  ],
  logic: getTargetingOptionsLogic,
  responseFormatter: getTargetingOptionsResponseFormatter,
};
