// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type SnapchatEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "snapchat_list_entities";
const TOOL_TITLE = "List Snapchat Ads Entities";
const TOOL_DESCRIPTION = `List Snapchat Ads entities with optional filtering and cursor-based pagination.

**Entity Hierarchy:** Advertiser > Campaign > Ad Group > Ad (+ Creatives)

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

All entities are scoped to an advertiser account. Pagination uses cursor-based paging.`;

export const ListEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to list"),
    adAccountId: z
      .string()
      .min(1)
      .describe("Snapchat Advertiser ID"),
    campaignId: z
      .string()
      .optional()
      .describe("Campaign ID (required for adGroup entity type)"),
    adSquadId: z
      .string()
      .optional()
      .describe("Ad Squad ID (required for ad entity type)"),
    cursor: z
      .string()
      .optional()
      .describe("Pagination cursor from previous response"),
  })
  .describe("Parameters for listing Snapchat Ads entities");

export const ListEntitiesOutputSchema = z
  .object({
    entities: z.array(z.record(z.any())).describe("List of entities"),
    nextCursor: z.string().optional().describe("Cursor for next page (undefined if no more results)"),
    has_more: z.boolean().describe("Whether more pages are available"),
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

  return {
    entities: result.entities as Record<string, unknown>[],
    nextCursor: result.nextCursor,
    has_more: !!result.nextCursor,
    timestamp: new Date().toISOString(),
  };
}

export function listEntitiesResponseFormatter(result: ListEntitiesOutput): McpTextContent[] {
  const summary = `Found ${result.entities.length} entities`;
  const pagination = result.has_more
    ? `\n\nMore results available. Use cursor: ${result.nextCursor}`
    : "";
  const entities =
    result.entities.length > 0
      ? `\n\nEntities:\n${JSON.stringify(result.entities, null, 2)}`
      : "\n\nNo entities found";

  return [
    {
      type: "text" as const,
      text: `${summary}${entities}${pagination}\n\nTimestamp: ${result.timestamp}`,
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