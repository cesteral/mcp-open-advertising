// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type SnapchatEntityType } from "../utils/entity-mapping.js";
import {
  PaginationOutputSchema,
  buildPaginationOutput,
  formatPaginationHint,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "snapchat_list_entities";
const TOOL_TITLE = "List Snapchat Ads Entities";
const TOOL_DESCRIPTION = `List Snapchat Ads entities with optional filtering and Snapchat next-link pagination.

**Entity Hierarchy:** Advertiser > Campaign > Ad Group > Ad (+ Creatives)

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

All entities are scoped to an advertiser account. Pagination uses Snapchat's returned next page link.`;

export const ListEntitiesInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entities to list"),
    adAccountId: z.string().min(1).describe("Snapchat Advertiser ID"),
    campaignId: z.string().optional().describe("Campaign ID (required for adGroup entity type)"),
    adSquadId: z.string().optional().describe("Ad Squad ID (required for ad entity type)"),
    cursor: z.string().optional().describe("Next page link from a previous response"),
  })
  .describe("Parameters for listing Snapchat Ads entities");

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
  const { snapchatService } = resolveSessionServices(sdkContext);

  const filters: Record<string, string> = { adAccountId: input.adAccountId };
  if (input.campaignId) filters.campaignId = input.campaignId;
  if (input.adSquadId) filters.adSquadId = input.adSquadId;

  const result = await snapchatService.listEntities(
    input.entityType as SnapchatEntityType,
    filters,
    input.cursor,
    context
  );

  const entities = result.entities as unknown as Record<string, unknown>[];
  return {
    entities,
    pagination: buildPaginationOutput({
      nextCursor: result.nextCursor,
      pageSize: entities.length,
      nextPageInputKey: "cursor",
    }),
    timestamp: new Date().toISOString(),
  };
}

export function listEntitiesResponseFormatter(result: ListEntitiesOutput): McpTextContent[] {
  const count = result.pagination.pageSize;
  const summary = `Found ${count} entities`;
  const entities =
    count > 0
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
      label: "List campaigns",
      input: {
        entityType: "campaign",
        adAccountId: "1234567890",
      },
    },
    {
      label: "List ad groups for a campaign",
      input: {
        entityType: "adGroup",
        adAccountId: "1234567890",
        campaignId: "campaign_abc123",
      },
    },
  ],
  logic: listEntitiesLogic,
  responseFormatter: listEntitiesResponseFormatter,
};
