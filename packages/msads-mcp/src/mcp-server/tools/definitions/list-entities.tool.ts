// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type MsAdsEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_list_entities";
const TOOL_TITLE = "List Microsoft Ads Entities";
const TOOL_DESCRIPTION = `List Microsoft Advertising entities by account or parent entity.

Supported entity types: ${getEntityTypeEnum().join(", ")}

- Top-level entities (campaign, budget, label): list by accountId
- Child entities (adGroup, ad, keyword): list by parentId (campaign or ad group)
- Use filters to narrow results`;

export const ListEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to list"),
    accountId: z
      .string()
      .optional()
      .describe("Microsoft Ads Account ID (for top-level entities)"),
    parentId: z
      .string()
      .optional()
      .describe("Parent entity ID (e.g., CampaignId for adGroups, AdGroupId for ads/keywords)"),
    filters: z
      .record(z.unknown())
      .optional()
      .describe("Additional filters to pass to the API"),
  })
  .describe("Parameters for listing Microsoft Ads entities");

export const ListEntitiesOutputSchema = z
  .object({
    entities: z.array(z.record(z.any())).describe("List of entities"),
    entityType: z.string(),
    count: z.number(),
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
  const { msadsService } = resolveSessionServices(sdkContext);

  const { entities: rawEntities } = await msadsService.listEntities(
    input.entityType as MsAdsEntityType,
    {
      accountId: input.accountId,
      parentId: input.parentId,
      filters: input.filters,
    },
    context
  );

  const entities = rawEntities as unknown as Record<string, unknown>[];

  return {
    entities,
    entityType: input.entityType,
    count: entities.length,
    timestamp: new Date().toISOString(),
  };
}

export function listEntitiesResponseFormatter(result: ListEntitiesOutput): McpTextContent[] {
  const summary = `Found ${result.count} ${result.entityType} entities`;
  const entities =
    result.entities.length > 0
      ? `\n\nEntities:\n${JSON.stringify(result.entities, null, 2)}`
      : "\n\nNo entities found";

  return [
    {
      type: "text" as const,
      text: `${summary}${entities}\n\nTimestamp: ${result.timestamp}`,
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
      input: { entityType: "campaign", accountId: "123456789" },
    },
    {
      label: "List ad groups for a campaign",
      input: { entityType: "adGroup", parentId: "987654321" },
    },
  ],
  logic: listEntitiesLogic,
  responseFormatter: listEntitiesResponseFormatter,
};