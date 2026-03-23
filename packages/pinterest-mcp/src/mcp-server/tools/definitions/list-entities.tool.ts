// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type PinterestEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "pinterest_list_entities";
const TOOL_TITLE = "List Pinterest Ads Entities";
const TOOL_DESCRIPTION = `List Pinterest Ads entities with optional filtering and cursor-based pagination.

**Entity Hierarchy:** Advertiser > Campaign > Ad Group > Ad (+ Creatives)

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

All entities are scoped to an advertiser account. Pagination uses cursor-based \`bookmark\` tokens.`;

export const ListEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to list"),
    adAccountId: z
      .string()
      .min(1)
      .describe("Pinterest Advertiser ID"),
    campaignId: z
      .string()
      .optional()
      .describe("Filter by campaign ID (for adGroup/ad entity types)"),
    adGroupId: z
      .string()
      .optional()
      .describe("Filter by ad group ID (for ad entity type)"),
    bookmark: z
      .string()
      .optional()
      .describe("Cursor for next page (from previous response's bookmark)"),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(250)
      .optional()
      .default(25)
      .describe("Number of entities per page (default 25, max 250)"),
  })
  .describe("Parameters for listing Pinterest Ads entities");

export const ListEntitiesOutputSchema = z
  .object({
    entities: z.array(z.record(z.any())).describe("List of entities"),
    bookmark: z.string().nullable().describe("Cursor for next page (null if no more pages)"),
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
  const { pinterestService } = resolveSessionServices(sdkContext);

  const result = await pinterestService.listEntities(
    input.entityType as PinterestEntityType,
    {
      adAccountId: input.adAccountId,
      campaignId: input.campaignId,
      adGroupId: input.adGroupId,
    },
    input.bookmark,
    input.pageSize,
    context
  );

  return {
    entities: result.entities as unknown as Record<string, unknown>[],
    bookmark: result.pageInfo.bookmark,
    has_more: result.pageInfo.bookmark != null,
    timestamp: new Date().toISOString(),
  };
}

export function listEntitiesResponseFormatter(result: ListEntitiesOutput): McpTextContent[] {
  const summary = `Found ${result.entities.length} entities`;
  const pagination = result.has_more
    ? `\n\nMore results available. Use bookmark: ${result.bookmark}`
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
        pageSize: 25,
      },
    },
    {
      label: "List ad groups in a campaign",
      input: {
        entityType: "adGroup",
        adAccountId: "1234567890",
        campaignId: "1800123456789",
      },
    },
    {
      label: "List next page using bookmark",
      input: {
        entityType: "campaign",
        adAccountId: "1234567890",
        bookmark: "ZmVlZDE%3D",
      },
    },
  ],
  logic: listEntitiesLogic,
  responseFormatter: listEntitiesResponseFormatter,
};