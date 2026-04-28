// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type TikTokEntityType } from "../utils/entity-mapping.js";
import {
  PaginationOutputSchema,
  buildPaginationOutput,
  formatPaginationHint,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "tiktok_list_entities";
const TOOL_TITLE = "List TikTok Ads Entities";
const TOOL_DESCRIPTION = `List TikTok Ads entities with optional filtering and page-based pagination.

**Entity Hierarchy:** Advertiser > Campaign > Ad Group > Ad (+ Creatives)

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

All entities are scoped to an advertiser account. Pagination uses \`page\` (1-based) and \`pageSize\`.`;

export const ListEntitiesInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entities to list"),
    advertiserId: z
      .string()
      .min(1)
      .describe(
        "TikTok Advertiser ID (informational — the session-bound advertiser from authentication is used for API calls)"
      ),
    filters: z
      .record(z.unknown())
      .optional()
      .describe(
        "Optional TikTok filtering object (for example { primary_status: 'STATUS_ALL' } or { campaign_ids: ['123'] })"
      ),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .default(1)
      .describe("Page number (1-based, default 1)"),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .default(10)
      .describe("Number of entities per page (default 10, max 1000)"),
  })
  .describe("Parameters for listing TikTok Ads entities");

export const ListEntitiesOutputSchema = z
  .object({
    entities: z.array(z.record(z.any())).describe("List of entities"),
    pagination: PaginationOutputSchema,
    timestamp: z.string().datetime(),
  })
  .describe("Entity list result");

type ListEntitiesInput = z.infer<typeof ListEntitiesInputSchema>;
type ListEntitiesOutput = z.infer<typeof ListEntitiesOutputSchema>;

export async function listEntitiesLogic(
  input: ListEntitiesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListEntitiesOutput> {
  const { tiktokService } = resolveSessionServices(sdkContext);

  const result = await tiktokService.listEntities(
    input.entityType as TikTokEntityType,
    input.filters,
    input.page,
    input.pageSize,
    context
  );

  const { pageInfo } = result;
  const hasMore = pageInfo.page < pageInfo.total_page;
  const nextPage = pageInfo.page + 1;
  const entities = result.entities as unknown as Record<string, unknown>[];

  return {
    entities,
    pagination: buildPaginationOutput({
      nextCursor: hasMore ? String(nextPage) : null,
      pageSize: entities.length,
      totalCount: pageInfo.total_number,
      nextPageInputKey: "page",
    }),
    timestamp: new Date().toISOString(),
  };
}

export function listEntitiesResponseFormatter(result: ListEntitiesOutput): McpTextContent[] {
  const { pageSize, totalCount } = result.pagination;
  const summary = `Found ${pageSize} entities${
    totalCount !== undefined ? ` (total ${totalCount})` : ""
  }`;
  const entities =
    pageSize > 0
      ? `\n\nEntities:\n${JSON.stringify(result.entities, null, 2)}`
      : "\n\nNo entities found";

  return [
    {
      type: "text" as const,
      text: `${summary}${entities}${formatPaginationHint(result.pagination)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const listEntitiesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ListEntitiesInputSchema,
  outputSchema: ListEntitiesOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "List active campaigns",
      input: {
        entityType: "campaign",
        advertiserId: "1234567890",
        filters: { primary_status: "STATUS_ALL" },
        page: 1,
        pageSize: 10,
      },
    },
    {
      label: "List ad groups",
      input: {
        entityType: "adGroup",
        advertiserId: "1234567890",
      },
    },
  ],
  logic: listEntitiesLogic,
  responseFormatter: listEntitiesResponseFormatter,
};
