// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type AmazonDspEntityType } from "../utils/entity-mapping.js";
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
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to list"),
    profileId: z
      .string()
      .min(1)
      .describe("Amazon DSP Advertiser ID (used as the scope/profile)"),
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
    startIndex: z.number().describe("Current start index"),
    pageSize: z.number().describe("Number of results per page"),
    totalResults: z.number().describe("Total number of entities"),
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
  const { amazonDspService } = resolveSessionServices(sdkContext);

  const result = await amazonDspService.listEntities(
    input.entityType as AmazonDspEntityType,
    input.filters,
    input.startIndex,
    input.pageSize,
    context
  );

  const { pageInfo } = result;

  return {
    entities: result.entities as unknown as Record<string, unknown>[],
    startIndex: pageInfo.startIndex,
    pageSize: pageInfo.count,
    totalResults: pageInfo.totalResults,
    has_more: pageInfo.startIndex + pageInfo.count < pageInfo.totalResults,
    timestamp: new Date().toISOString(),
  };
}

export function listEntitiesResponseFormatter(result: ListEntitiesOutput): McpTextContent[] {
  const summary = `Found ${result.entities.length} entities (startIndex ${result.startIndex}, total ${result.totalResults})`;
  const pagination = result.has_more
    ? `\n\nMore results available. Use startIndex: ${result.startIndex + result.pageSize}`
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
