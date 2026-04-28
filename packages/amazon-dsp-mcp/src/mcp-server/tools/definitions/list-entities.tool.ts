// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type AmazonDspEntityType } from "../utils/entity-mapping.js";
import {
  PaginationOutputSchema,
  buildPaginationOutput,
  formatPaginationHint,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "amazon_dsp_list_entities";
const TOOL_TITLE = "List AmazonDsp Ads Entities";
const TOOL_DESCRIPTION = `List Amazon DSP entities with optional filtering and offset-based pagination.

**Entity Hierarchy:** Advertiser > Order (Campaign) > Line Item (Ad Group) > Creative

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

All entities are scoped to an advertiser account. Pagination uses \`startIndex\` (offset) and \`pageSize\`.
Use the entity-specific filter param: campaigns / orders filter by \`advertiserId\`, ad groups / line items filter by \`orderId\`, targets by \`lineItemId\`, and creative associations by \`lineItemId\`.`;

export const ListEntitiesInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entities to list"),
    profileId: z.string().min(1).describe("Amazon DSP Advertiser ID (used as the scope/profile)"),
    filters: z
      .record(z.string())
      .optional()
      .describe("Optional filter criteria (e.g., { advertiserId: '123', orderId: '456' })"),
    startIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(0)
      .describe("Start index for offset pagination (default 0)"),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(25)
      .describe("Number of entities per page (default 25, max 100)"),
  })
  .describe("Parameters for listing Amazon DSP entities");

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
  const { amazonDspService } = resolveSessionServices(sdkContext);

  const result = await amazonDspService.listEntities(
    input.entityType as AmazonDspEntityType,
    input.filters,
    input.startIndex,
    input.pageSize,
    context
  );

  const { pageInfo } = result;
  const hasMore = pageInfo.startIndex + pageInfo.count < pageInfo.totalResults;
  const nextStartIndex = pageInfo.startIndex + pageInfo.count;

  return {
    entities: result.entities as unknown as Record<string, unknown>[],
    pagination: buildPaginationOutput({
      nextCursor: hasMore ? String(nextStartIndex) : null,
      pageSize: pageInfo.count,
      totalCount: pageInfo.totalResults,
      nextPageInputKey: "startIndex",
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
      label: "List active orders (campaigns)",
      input: {
        entityType: "campaign",
        profileId: "1234567890",
        filters: { advertiserId: "adv_123" },
        startIndex: 0,
        pageSize: 25,
      },
    },
    {
      label: "List line items for an order",
      input: {
        entityType: "adGroup",
        profileId: "1234567890",
        filters: { orderId: "ord_456" },
      },
    },
  ],
  logic: listEntitiesLogic,
  responseFormatter: listEntitiesResponseFormatter,
};
