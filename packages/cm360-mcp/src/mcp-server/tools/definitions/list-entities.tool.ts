// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type CM360EntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "cm360_list_entities";
const TOOL_TITLE = "List CM360 Entities";
const TOOL_DESCRIPTION = `List Campaign Manager 360 entities with optional filtering and pagination.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

All operations require a profileId (use cm360_list_user_profiles to discover yours).`;

export const ListEntitiesInputSchema = z
  .object({
    profileId: z.string().min(1).describe("CM360 User Profile ID"),
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entities to list"),
    filters: z
      .record(z.unknown())
      .optional()
      .describe(
        "Filter fields to pass as query parameters (e.g., advertiserId, campaignId, searchString)"
      ),
    pageToken: z.string().optional().describe("Page token for pagination"),
    maxResults: z
      .number()
      .min(1)
      .max(1000)
      .optional()
      .describe("Maximum number of results per page"),
  })
  .describe("Parameters for listing CM360 entities");

export const ListEntitiesOutputSchema = z
  .object({
    entities: z.array(z.record(z.any())).describe("List of entities"),
    nextPageToken: z.string().optional().describe("Token for next page"),
    has_more: z.boolean().describe("Whether more results are available"),
    totalCount: z.number().describe("Number of entities in this page"),
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
  const { cm360Service } = resolveSessionServices(sdkContext);

  const result = await cm360Service.listEntities(
    input.entityType as CM360EntityType,
    input.profileId,
    input.filters,
    input.pageToken,
    input.maxResults,
    context
  );

  return {
    entities: result.entities as unknown as Record<string, any>[],
    nextPageToken: result.nextPageToken,
    has_more: !!result.nextPageToken,
    totalCount: (result.entities as unknown[]).length,
    timestamp: new Date().toISOString(),
  };
}

export function listEntitiesResponseFormatter(result: ListEntitiesOutput): McpTextContent[] {
  const summary = `Found ${result.totalCount} entities`;
  const pagination = result.nextPageToken
    ? `\n\nMore results available. Use pageToken: ${result.nextPageToken}`
    : "";
  const entities =
    result.totalCount > 0
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
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "List campaigns for a profile",
      input: {
        profileId: "123456",
        entityType: "campaign",
        maxResults: 50,
      },
    },
    {
      label: "List placements filtered by campaign",
      input: {
        profileId: "123456",
        entityType: "placement",
        filters: { campaignIds: "789012" },
        maxResults: 25,
      },
    },
    {
      label: "List floodlight activities",
      input: {
        profileId: "123456",
        entityType: "floodlightActivity",
        filters: { advertiserId: "456789" },
      },
    },
  ],
  logic: listEntitiesLogic,
  responseFormatter: listEntitiesResponseFormatter,
};
