// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "linkedin_search_targeting";
const TOOL_TITLE = "Search LinkedIn Ads Targeting Facets";
const TOOL_DESCRIPTION = `Search LinkedIn audience targeting facets.

**Supported facet types:**
- MEMBER_INTERESTS: Professional interests
- MEMBER_SKILLS: Skills and expertise
- MEMBER_JOB_TITLE: Job titles
- MEMBER_JOB_FUNCTION: Job functions (e.g., Engineering, Marketing)
- MEMBER_INDUSTRY: Industry types
- MEMBER_SENIORITY: Seniority levels
- MEMBER_COMPANY_SIZE: Company size ranges
- GEO: Geographic locations
- MEMBER_SCHOOLS: Educational institutions

Returns matching facet options with their LinkedIn URNs for use in targeting criteria.`;

export const SearchTargetingInputSchema = z
  .object({
    facetType: z
      .string()
      .describe("Targeting facet type to search (e.g., MEMBER_INTERESTS, GEO)"),
    query: z
      .string()
      .optional()
      .describe("Search query string to filter results"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Maximum number of results (default 20)"),
  })
  .describe("Parameters for searching LinkedIn targeting facets");

export const SearchTargetingOutputSchema = z
  .object({
    facetType: z.string(),
    results: z.array(z.record(z.any())),
    count: z.number(),
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
  const { linkedInService } = resolveSessionServices(sdkContext);

  const result = (await linkedInService.searchTargeting(
    input.facetType,
    input.query,
    input.limit,
    context
  )) as Record<string, unknown>;

  const elements = (result.elements as unknown[]) ?? [];

  return {
    facetType: input.facetType,
    results: elements as Record<string, unknown>[],
    count: elements.length,
    timestamp: new Date().toISOString(),
  };
}

export function searchTargetingResponseFormatter(result: SearchTargetingOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Targeting search results for ${result.facetType}\nFound ${result.count} options\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: true,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Search for job titles",
      input: {
        facetType: "MEMBER_JOB_TITLE",
        query: "software engineer",
        limit: 20,
      },
    },
    {
      label: "Browse geographic locations",
      input: {
        facetType: "GEO",
        query: "United Kingdom",
      },
    },
    {
      label: "List seniority levels",
      input: {
        facetType: "MEMBER_SENIORITY",
        limit: 50,
      },
    },
  ],
  logic: searchTargetingLogic,
  responseFormatter: searchTargetingResponseFormatter,
};