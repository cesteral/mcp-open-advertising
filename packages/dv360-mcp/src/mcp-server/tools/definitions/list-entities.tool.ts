import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  getSupportedEntityTypesDynamic,
  getEntityConfigDynamic,
} from "../utils/entity-mapping-dynamic.js";
import { extractParentIds } from "../utils/entity-id-extraction.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "dv360_list_entities";
const TOOL_TITLE = "List DV360 Entities";

function generateToolDescription(): string {
  return `List DV360 entities with optional filtering and pagination.

**Entity Hierarchy:**
partner > advertiser > campaign > insertionOrder > lineItem

**Filtering:** Use campaignId to filter insertion orders, insertionOrderId to filter line items.

Supports all entity types: ${getSupportedEntityTypesDynamic().join(", ")}`;
}

const TOOL_DESCRIPTION = generateToolDescription();

/**
 * Input schema for list entities tool with dynamic validation
 * Uses Zod refinement to enforce entity-specific parent ID requirements
 */
export const ListEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getSupportedEntityTypesDynamic() as [string, ...string[]])
      .describe("Type of entities to list"),
    partnerId: z.string().optional().describe("Partner ID (required for advertisers)"),
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID (required for campaigns, insertion orders, line items, etc.)"),
    campaignId: z.string().optional().describe("Campaign ID (for filtering)"),
    insertionOrderId: z.string().optional().describe("Insertion Order ID (for filtering)"),
    filter: z
      .string()
      .optional()
      .describe("Filter expression (e.g., 'entityStatus=ENTITY_STATUS_ACTIVE')"),
    pageToken: z.string().optional().describe("Page token for pagination"),
    pageSize: z.number().min(1).max(100).optional().describe("Number of entities to return"),
  })
  .refine(
    (data) => {
      // Get entity configuration to check required parent IDs
      const config = getEntityConfigDynamic(data.entityType);

      // Validate all required parent IDs are present
      for (const requiredParentId of config.parentIds) {
        if (!data[requiredParentId as keyof typeof data]) {
          return false;
        }
      }

      return true;
    },
    (data) => {
      // Generate helpful error message with specific missing IDs
      const config = getEntityConfigDynamic(data.entityType);
      const missingIds = config.parentIds.filter((id) => !data[id as keyof typeof data]);

      return {
        message: `Missing required parent ID(s) for entity type '${data.entityType}': ${missingIds.join(", ")}. Required: ${config.parentIds.join(", ")}`,
        path: missingIds,
      };
    }
  )
  .describe("Parameters for listing DV360 entities");

/**
 * Output schema for list entities tool
 */
export const ListEntitiesOutputSchema = z
  .object({
    entities: z.array(z.record(z.any())).describe("List of entities"),
    nextPageToken: z.string().optional().describe("Token for next page of results"),
    has_more: z.boolean().describe("Whether more results are available via pagination"),
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
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListEntitiesOutput> {
  // Resolve services for this session
  const { dv360Service } = resolveSessionServices(sdkContext);

  // Extract parent IDs using utility
  const parentIds = extractParentIds(input);

  // Get entity configuration to determine which IDs should become filters
  const config = getEntityConfigDynamic(input.entityType);

  // Build filter expression combining user filter + dynamic hierarchy filters
  const filterParts: string[] = [];

  if (input.filter) {
    filterParts.push(input.filter);
  }

  // Auto-convert filterParamIds to filter expressions
  for (const filterParamId of config.filterParamIds) {
    const value = (input as any)[filterParamId];
    if (value) {
      filterParts.push(`${filterParamId}=${value}`);
      // Remove from parentIds since it's a filter, not a path/query param
      delete parentIds[filterParamId];
    }
  }

  const combinedFilter = filterParts.length > 0 ? filterParts.join(" AND ") : undefined;

  // List entities
  const result = await dv360Service.listEntities(
    input.entityType,
    parentIds,
    combinedFilter,
    input.pageToken,
    input.pageSize,
    context
  );

  return {
    entities: result.entities as Record<string, any>[],
    nextPageToken: result.nextPageToken,
    has_more: !!result.nextPageToken,
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
  inputExamples: [
    {
      label: "List all active line items under an advertiser",
      input: {
        entityType: "lineItem",
        advertiserId: "1234567",
        filter: "entityStatus=ENTITY_STATUS_ACTIVE",
        pageSize: 50,
      },
    },
    {
      label: "List insertion orders for a specific campaign",
      input: {
        entityType: "insertionOrder",
        advertiserId: "1234567",
        campaignId: "9876543",
        pageSize: 20,
      },
    },
    {
      label: "List all campaigns for an advertiser",
      input: {
        entityType: "campaign",
        advertiserId: "1234567",
        pageSize: 100,
      },
    },
  ],
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
  },
  logic: listEntitiesLogic,
  responseFormatter: listEntitiesResponseFormatter,
};
