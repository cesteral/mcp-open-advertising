import { z } from "zod";
import { container } from "tsyringe";
import { DV360Service } from "../../../services/dv360/DV360Service.js";
import { getSupportedEntityTypesDynamic } from "../utils/entityMappingDynamic.js";
import { extractParentIds } from "../utils/entityIdExtraction.js";
import type { RequestContext } from "../../../utils/internal/requestContext.js";

const TOOL_NAME = "dv360_list_entities";
const TOOL_TITLE = "List DV360 Entities";
const TOOL_DESCRIPTION =
  "List DV360 entities with optional filtering and pagination (supports partners, advertisers, campaigns, insertion orders, line items, ad groups, ads, creatives)";

/**
 * Input schema for list entities tool
 */
export const ListEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getSupportedEntityTypesDynamic() as [string, ...string[]])
      .describe("Type of entities to list"),
    partnerId: z.string().optional().describe("Partner ID (if required for entity type)"),
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID (if required for entity type)"),
    campaignId: z.string().optional().describe("Campaign ID (for filtering)"),
    insertionOrderId: z.string().optional().describe("Insertion Order ID (for filtering)"),
    filter: z
      .string()
      .optional()
      .describe("Filter expression (e.g., 'entityStatus=ENTITY_STATUS_ACTIVE')"),
    pageToken: z.string().optional().describe("Page token for pagination"),
    pageSize: z.number().min(1).max(100).optional().describe("Number of entities to return"),
  })
  .describe("Parameters for listing DV360 entities");

/**
 * Output schema for list entities tool
 */
export const ListEntitiesOutputSchema = z
  .object({
    entities: z.array(z.record(z.any())).describe("List of entities"),
    nextPageToken: z.string().optional().describe("Token for next page of results"),
    totalCount: z.number().describe("Number of entities in this page"),
    timestamp: z.string().datetime(),
  })
  .describe("Entity list result");

type ListEntitiesInput = z.infer<typeof ListEntitiesInputSchema>;
type ListEntitiesOutput = z.infer<typeof ListEntitiesOutputSchema>;

/**
 * List entities tool logic
 */
export async function listEntitiesLogic(
  input: ListEntitiesInput,
  context: RequestContext
): Promise<ListEntitiesOutput> {
  // Resolve DV360Service from container
  const dv360Service = container.resolve(DV360Service);

  // Extract parent IDs using utility
  const parentIds = extractParentIds(input);

  // List entities
  const result = await dv360Service.listEntities(
    input.entityType,
    parentIds,
    input.filter,
    input.pageToken,
    context
  );

  return {
    entities: result.entities as Record<string, any>[],
    nextPageToken: result.nextPageToken,
    totalCount: result.entities.length,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format response for MCP client
 */
export function listEntitiesResponseFormatter(result: ListEntitiesOutput): any {
  const summary = `Found ${result.totalCount} entities`;
  const pagination = result.nextPageToken
    ? `\n\nMore results available. Use nextPageToken: ${result.nextPageToken}`
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

/**
 * List Entities Tool Definition
 */
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
  },
  logic: listEntitiesLogic,
  responseFormatter: listEntitiesResponseFormatter,
};
