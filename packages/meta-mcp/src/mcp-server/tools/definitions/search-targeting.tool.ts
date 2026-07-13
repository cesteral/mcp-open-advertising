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

const TOOL_NAME = "meta_search_targeting";
const TOOL_TITLE = "Search Meta Targeting Options";
const TOOL_DESCRIPTION = `Search for targeting options (interests, behaviors, demographics) by keyword.

**Search types:**
- \`adinterest\` — Search interests by keyword
- \`adinterestsuggestion\` — Get suggestions based on existing interests
- \`adinterestvalid\` — Validate interest IDs
- \`adbehavior\` — Search behavioral targeting options
- \`adTargetingCategory\` — Browse targeting categories
- \`adgeolocation\` — Search geographic locations
- \`adlocale\` — Search locales/languages

Returns matching options with ID, name, audience size, and path.`;

export const SearchTargetingInputSchema = z
  .object({
    type: z
      .string()
      .describe("Search type (adinterest, adinterestsuggestion, adgeolocation, adlocale, etc.)"),
    query: z.string().min(1).describe("Search keyword or query"),
    limit: z.number().min(1).max(100).optional().describe("Max results per page (default 25)"),
    after: z
      .string()
      .optional()
      .describe("Opaque pagination cursor from a previous response's `pagination.nextCursor`."),
  })
  .describe("Parameters for searching targeting options");

export const SearchTargetingOutputSchema = z
  .object({
    results: z.array(z.record(z.any())).describe("Matching targeting options"),
    totalCount: z.number().describe("Number of targeting options returned in this page"),
    pagination: PaginationOutputSchema,
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
  const { metaTargetingService } = resolveSessionServices(sdkContext);

  const result = await metaTargetingService.searchTargeting(
    input.type,
    input.query,
    input.limit,
    context,
    input.after
  );

  const response = (result as Record<string, unknown>) ?? {};
  const data = (response.data as unknown[]) || [];

  // Meta cursor pagination: `paging.next` present ⇒ more pages; the cursor to
  // pass back is `paging.cursors.after`. Absent when the result set is exhausted.
  const paging = response.paging as { next?: string; cursors?: { after?: string } } | undefined;
  const nextCursor = paging?.next ? (paging.cursors?.after ?? null) : null;

  return {
    results: data as Record<string, unknown>[],
    totalCount: data.length,
    pagination: buildPaginationOutput({
      nextCursor,
      pageSize: data.length,
      nextPageInputKey: "after",
    }),
    timestamp: new Date().toISOString(),
  };
}

export function searchTargetingResponseFormatter(result: SearchTargetingOutput): McpTextContent[] {
  const summary = `Found ${result.totalCount} targeting option(s)`;
  const data =
    result.totalCount > 0
      ? `\n\n${JSON.stringify(result.results, null, 2)}`
      : "\n\nNo matching targeting options found";

  return [
    {
      type: "text" as const,
      text: `${summary}${data}${formatPaginationHint(result.pagination)}\n\nTimestamp: ${result.timestamp}`,
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
      label: "Search for interest targeting",
      input: {
        type: "adinterest",
        query: "running shoes",
        limit: 10,
      },
    },
    {
      label: "Search for geographic locations",
      input: {
        type: "adgeolocation",
        query: "New York",
      },
    },
  ],
  logic: searchTargetingLogic,
  responseFormatter: searchTargetingResponseFormatter,
};
