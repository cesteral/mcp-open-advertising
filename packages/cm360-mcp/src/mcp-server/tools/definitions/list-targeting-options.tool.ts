// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "cm360_list_targeting_options";
const TOOL_TITLE = "List CM360 Targeting Options";
const TOOL_DESCRIPTION = `List available targeting options from the CM360 API.

Supports browsing browsers, connection types, content categories, countries, languages, metros, operating systems, platform types, and more.`;

const TARGETING_TYPES = [
  "browsers",
  "connectionTypes",
  "contentCategories",
  "countries",
  "languages",
  "metros",
  "mobileCarriers",
  "operatingSystemVersions",
  "operatingSystems",
  "platformTypes",
  "postalCodes",
  "regions",
  "cities",
] as const;

export const ListTargetingOptionsInputSchema = z
  .object({
    profileId: z
      .string()
      .min(1)
      .describe("CM360 User Profile ID"),
    targetingType: z
      .enum(TARGETING_TYPES)
      .describe("Type of targeting options to list"),
    filters: z
      .record(z.unknown())
      .optional()
      .describe("Optional filter parameters (e.g., countryDartIds for regions)"),
    pageToken: z
      .string()
      .optional()
      .describe("Page token for pagination"),
    maxResults: z
      .number()
      .min(1)
      .max(1000)
      .optional()
      .describe("Maximum results per page"),
  })
  .describe("Parameters for listing targeting options");

export const ListTargetingOptionsOutputSchema = z
  .object({
    options: z.array(z.record(z.any())).describe("Targeting options"),
    nextPageToken: z.string().optional().describe("Token for next page"),
    totalCount: z.number().describe("Number of options in this page"),
    timestamp: z.string().datetime(),
  })
  .describe("Targeting options result");

type ListTargetingOptionsInput = z.infer<typeof ListTargetingOptionsInputSchema>;
type ListTargetingOptionsOutput = z.infer<typeof ListTargetingOptionsOutputSchema>;

export async function listTargetingOptionsLogic(
  input: ListTargetingOptionsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListTargetingOptionsOutput> {
  const { cm360Service } = resolveSessionServices(sdkContext);

  const { options, nextPageToken } = await cm360Service.listTargetingOptions(
    input.profileId,
    input.targetingType,
    input.filters,
    input.pageToken,
    input.maxResults,
    context
  );

  return {
    options: options as Record<string, any>[],
    nextPageToken,
    totalCount: options.length,
    timestamp: new Date().toISOString(),
  };
}

export function listTargetingOptionsResponseFormatter(result: ListTargetingOptionsOutput): McpTextContent[] {
  const pagination = result.nextPageToken
    ? `\n\nMore results available. Use pageToken: ${result.nextPageToken}`
    : "";
  const options =
    result.totalCount > 0
      ? `\n\nOptions:\n${JSON.stringify(result.options, null, 2)}`
      : "\n\nNo options found";

  return [
    {
      type: "text" as const,
      text: `Found ${result.totalCount} targeting options${options}${pagination}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const listTargetingOptionsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ListTargetingOptionsInputSchema,
  outputSchema: ListTargetingOptionsOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "List available browsers",
      input: {
        profileId: "123456",
        targetingType: "browsers",
      },
    },
    {
      label: "List countries",
      input: {
        profileId: "123456",
        targetingType: "countries",
      },
    },
    {
      label: "List metros in a specific country",
      input: {
        profileId: "123456",
        targetingType: "metros",
        filters: { countryDartIds: "2840" },
      },
    },
  ],
  logic: listTargetingOptionsLogic,
  responseFormatter: listTargetingOptionsResponseFormatter,
};