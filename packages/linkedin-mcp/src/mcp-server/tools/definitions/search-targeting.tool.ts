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

const TOOL_NAME = "linkedin_search_targeting";
const TOOL_TITLE = "Search LinkedIn Ads Targeting Facets";
const TOOL_DESCRIPTION = `Search LinkedIn audience targeting facets with offset-based pagination.

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

Returns matching facet options with their LinkedIn URNs for use in targeting criteria. Large facet types (e.g. GEO, MEMBER_INDUSTRY) page — use the \`start\` offset returned in \`pagination.nextCursor\` for subsequent pages.`;

export const SearchTargetingInputSchema = z
  .object({
    facetType: z.string().describe("Targeting facet type to search (e.g., MEMBER_INTERESTS, GEO)"),
    query: z.string().optional().describe("Search query string to filter results"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Maximum number of results per page (default 20, max 100)"),
    start: z.number().int().min(0).optional().describe("Offset for pagination (default 0)"),
  })
  .describe("Parameters for searching LinkedIn targeting facets");

export const SearchTargetingOutputSchema = z
  .object({
    facetType: z.string(),
    results: z.array(z.record(z.any())),
    pagination: PaginationOutputSchema,
    timestamp: z.string().datetime(),
  })
  .describe("Targeting search result");

type SearchTargetingInput = z.infer<typeof SearchTargetingInputSchema>;
type SearchTargetingOutput = z.infer<typeof SearchTargetingOutputSchema>;

interface LinkedInPagingLike {
  start?: number;
  count?: number;
  total?: number;
}

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
    input.start,
    context
  )) as Record<string, unknown>;

  const elements = (result.elements as unknown[]) ?? [];
  const paging = (result.paging as LinkedInPagingLike | undefined) ?? undefined;

  const pageSize = elements.length;
  const total = paging?.total;
  const currentStart = paging?.start ?? input.start ?? 0;
  const requestedLimit = input.limit ?? 20;
  const hasMore =
    total !== undefined ? currentStart + pageSize < total : pageSize >= requestedLimit;
  const nextStart = currentStart + pageSize;

  return {
    facetType: input.facetType,
    results: elements as Record<string, unknown>[],
    pagination: buildPaginationOutput({
      nextCursor: hasMore ? String(nextStart) : null,
      pageSize,
      totalCount: total,
      nextPageInputKey: "start",
    }),
    timestamp: new Date().toISOString(),
  };
}

export function searchTargetingResponseFormatter(result: SearchTargetingOutput): McpTextContent[] {
  const { pageSize, totalCount } = result.pagination;
  const totalInfo = totalCount !== undefined ? ` of ${totalCount}` : "";
  return [
    {
      type: "text" as const,
      text: `Targeting search results for ${result.facetType}\nFound ${pageSize}${totalInfo} options\n\n${JSON.stringify(result.results, null, 2)}${formatPaginationHint(result.pagination)}\n\nTimestamp: ${result.timestamp}`,
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
      label: "Paginate through industries (second page)",
      input: {
        facetType: "MEMBER_INDUSTRY",
        limit: 50,
        start: 50,
      },
    },
  ],
  logic: searchTargetingLogic,
  responseFormatter: searchTargetingResponseFormatter,
};
