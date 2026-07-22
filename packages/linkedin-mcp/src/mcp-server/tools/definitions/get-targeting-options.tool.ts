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

const TOOL_NAME = "linkedin_get_targeting_options";
const TOOL_TITLE = "Get LinkedIn Ads Targeting Options";
const TOOL_DESCRIPTION = `Browse available targeting categories and facets for a LinkedIn Ads account.

Returns targeting facet metadata available for the given ad account.
Use linkedin_search_targeting to search within a specific facet.

Accounts can expose more facets than fit in one page — use the \`start\` offset returned in \`pagination.nextCursor\` for subsequent pages.`;

export const GetTargetingOptionsInputSchema = z
  .object({
    adAccountUrn: z
      .string()
      .min(1)
      .describe("The ad account URN (e.g., urn:li:sponsoredAccount:123)"),
    facetType: z
      .string()
      .optional()
      .describe("Filter to a specific facet type (optional, returns all if omitted)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Maximum number of results per page (default 20, max 100)"),
    start: z.number().int().min(0).optional().describe("Offset for pagination (default 0)"),
  })
  .describe("Parameters for getting LinkedIn targeting options");

export const GetTargetingOptionsOutputSchema = z
  .object({
    options: z.array(z.record(z.any())).describe("Available targeting options"),
    count: z.number(),
    pagination: PaginationOutputSchema,
    timestamp: z.string().datetime(),
  })
  .describe("Targeting options result");

type GetTargetingOptionsInput = z.infer<typeof GetTargetingOptionsInputSchema>;
type GetTargetingOptionsOutput = z.infer<typeof GetTargetingOptionsOutputSchema>;

interface LinkedInPagingLike {
  start?: number;
  count?: number;
  total?: number;
}

export async function getTargetingOptionsLogic(
  input: GetTargetingOptionsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetTargetingOptionsOutput> {
  const { linkedInService } = resolveSessionServices(sdkContext);

  const result = (await linkedInService.getTargetingOptions(
    input.adAccountUrn,
    input.facetType,
    input.start,
    input.limit,
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
    options: elements as Record<string, unknown>[],
    count: pageSize,
    pagination: buildPaginationOutput({
      nextCursor: hasMore ? String(nextStart) : null,
      pageSize,
      totalCount: total,
      nextPageInputKey: "start",
    }),
    timestamp: new Date().toISOString(),
  };
}

export function getTargetingOptionsResponseFormatter(
  result: GetTargetingOptionsOutput
): McpTextContent[] {
  const { totalCount } = result.pagination;
  const totalInfo = totalCount !== undefined ? ` of ${totalCount}` : "";
  return [
    {
      type: "text" as const,
      text: `Found ${result.count}${totalInfo} targeting options\n\n${JSON.stringify(result.options, null, 2)}${formatPaginationHint(result.pagination)}\n\nTimestamp: ${result.timestamp}`,
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
      label: "Get all targeting options for an account",
      input: {
        adAccountUrn: "urn:li:sponsoredAccount:123456789",
      },
    },
    {
      label: "Get interest targeting options",
      input: {
        adAccountUrn: "urn:li:sponsoredAccount:123456789",
        facetType: "MEMBER_INTERESTS",
      },
    },
    {
      label: "Paginate through facets (second page)",
      input: {
        adAccountUrn: "urn:li:sponsoredAccount:123456789",
        limit: 50,
        start: 50,
      },
    },
  ],
  logic: getTargetingOptionsLogic,
  responseFormatter: getTargetingOptionsResponseFormatter,
};
