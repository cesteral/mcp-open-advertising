// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "linkedin_get_targeting_options";
const TOOL_TITLE = "List LinkedIn Ads Targeting Facets";
const TOOL_DESCRIPTION = `List the targeting facets LinkedIn offers (industries, seniorities, locations, skills, …).

Each facet has a \`facetName\`, an \`adTargetingFacetUrn\` (urn:li:adTargetingFacet:<facetName>, the key used in targetingCriteria), the \`entityTypes\` it holds, and the \`availableEntityFinders\` (AD_TARGETING_FACET = browse all values, TYPEAHEAD = search, SIMILAR_ENTITIES).

This is LinkedIn's plain facet list: it takes no parameters and does not depend on the ad account. Use linkedin_search_targeting to get the values inside a facet.`;

export const GetTargetingOptionsInputSchema = z
  .object({})
  .describe("No parameters: LinkedIn's facet list is the same for every account");

export const GetTargetingOptionsOutputSchema = z
  .object({
    facets: z.array(z.record(z.any())).describe("Targeting facet descriptors"),
    count: z.number(),
    timestamp: z.string().datetime(),
  })
  .describe("Targeting facets result");

type GetTargetingOptionsInput = z.infer<typeof GetTargetingOptionsInputSchema>;
type GetTargetingOptionsOutput = z.infer<typeof GetTargetingOptionsOutputSchema>;

export async function getTargetingOptionsLogic(
  _input: GetTargetingOptionsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetTargetingOptionsOutput> {
  const { linkedInService } = resolveSessionServices(sdkContext);

  const result = (await linkedInService.listTargetingFacets(context)) as {
    elements?: unknown[];
  };
  const facets = (result.elements ?? []) as Record<string, unknown>[];

  return {
    facets,
    count: facets.length,
    timestamp: new Date().toISOString(),
  };
}

export function getTargetingOptionsResponseFormatter(
  result: GetTargetingOptionsOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Found ${result.count} targeting facets\n\n${JSON.stringify(result.facets, null, 2)}\n\nUse linkedin_search_targeting with a facet name to get its values.\n\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: true,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "List every targeting facet",
      input: {},
    },
  ],
  logic: getTargetingOptionsLogic,
  responseFormatter: getTargetingOptionsResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.facets"],
    contentBlocks: [0],
  },
};
