// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type SA360EntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "sa360_list_entities";
const TOOL_TITLE = "List SA360 Entities";
const TOOL_DESCRIPTION = `List SA360 entities of a given type with optional query filters. Filters are applied as WHERE conditions. For complex queries, use \`sa360_search\` directly.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}`;

export const ListEntitiesInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to list"),
    customerId: z
      .string()
      .regex(/^\d+$/, "customerId must be numeric")
      .describe("SA360 customer ID (no dashes)"),
    filters: z
      .record(z.string())
      .optional()
      .describe(
        "Filter conditions as field:value pairs (e.g., { 'campaign.status': '= \\'ENABLED\\'' })"
      ),
    pageSize: z
      .number()
      .min(1)
      .max(10000)
      .optional()
      .default(100)
      .describe("Number of results per page (default 100)"),
    pageToken: z.string().optional().describe("Page token for pagination"),
    orderBy: z.string().optional().describe("ORDER BY clause (e.g., 'campaign.name ASC')"),
  })
  .describe("Parameters for listing SA360 entities");

export const ListEntitiesOutputSchema = z
  .object({
    entities: z.array(z.record(z.any())).describe("List of entities"),
    totalResultsCount: z.number().optional(),
    nextPageToken: z.string().optional(),
    has_more: z.boolean().describe("Whether more results are available via pagination"),
    timestamp: z.string().datetime(),
  })
  .describe("Entity listing result");

type ListEntitiesInput = z.infer<typeof ListEntitiesInputSchema>;
type ListEntitiesOutput = z.infer<typeof ListEntitiesOutputSchema>;

export async function listEntitiesLogic(
  input: ListEntitiesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListEntitiesOutput> {
  const { sa360Service } = resolveSessionServices(sdkContext);

  const result = await sa360Service.listEntities(
    input.entityType as SA360EntityType,
    input.customerId,
    input.filters,
    input.pageSize,
    input.pageToken,
    input.orderBy,
    context
  );

  return {
    entities: result.entities as unknown as Record<string, any>[],
    totalResultsCount: result.totalResultsCount,
    nextPageToken: result.nextPageToken,
    has_more: !!result.nextPageToken,
    timestamp: new Date().toISOString(),
  };
}

export function listEntitiesResponseFormatter(result: ListEntitiesOutput): McpTextContent[] {
  const summary = `Found ${result.entities.length} entities${
    result.totalResultsCount ? ` (${result.totalResultsCount} total)` : ""
  }${result.nextPageToken ? " — more pages available" : ""}`;

  return [
    {
      type: "text" as const,
      text: `${summary}\n\n${JSON.stringify(result.entities, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "List all enabled campaigns",
      input: {
        entityType: "campaign",
        customerId: "1234567890",
        filters: {
          "campaign.status": "= 'ENABLED'",
        },
      },
    },
    {
      label: "List ad groups in a campaign",
      input: {
        entityType: "adGroup",
        customerId: "1234567890",
        filters: {
          "ad_group.campaign": "= 'customers/1234567890/campaigns/9876543210'",
        },
        orderBy: "ad_group.name ASC",
      },
    },
  ],
  logic: listEntitiesLogic,
  responseFormatter: listEntitiesResponseFormatter,
};
