import { z } from "zod";
import { container } from "tsyringe";
import { DV360Service } from "../../../services/dv360/DV360Service.js";
import {
  getSupportedEntityTypesDynamic,
  getEntityConfigDynamic,
  generateRelationshipDescription,
  validateEntityRelationships,
  getEntityHierarchyPath,
} from "../utils/entityMappingDynamic.js";
import { extractParentIds } from "../utils/entityIdExtraction.js";
import type { RequestContext } from "../../../utils/internal/requestContext.js";
import { McpError, JsonRpcErrorCode } from "../../../utils/errors/index.js";

const TOOL_NAME = "dv360_create_entity";
const TOOL_TITLE = "Create DV360 Entity";

/**
 * Generate dynamic description that includes entity hierarchy information
 */
function generateToolDescription(): string {
  return `Create a new DV360 entity. Supports all entity types with automatic relationship validation.

Entity Hierarchy (parent > child):
- partner > advertiser > campaign > insertionOrder > lineItem
- advertiser > creative
- advertiser > adGroup

Important: When creating child entities, you must include parent ID fields in the data payload.

Examples:
- To create an insertionOrder: include 'campaignId' in data (not just as a parameter)
- To create a lineItem: include 'insertionOrderId' in data
- To create a campaign: include 'advertiserId' in data

Supported entity types: ${getSupportedEntityTypesDynamic().join(", ")}`;
}

const TOOL_DESCRIPTION = generateToolDescription();

/**
 * Input schema for create entity tool with dynamic validation
 * Uses Zod refinement to enforce entity-specific parent ID requirements
 */
export const CreateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getSupportedEntityTypesDynamic() as [string, ...string[]])
      .describe("Type of entity to create"),
    partnerId: z.string().optional().describe("Partner ID (if required for entity type)"),
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID (if required for entity type)"),
    campaignId: z
      .string()
      .optional()
      .describe("Campaign ID (if required for entity type)"),
    insertionOrderId: z
      .string()
      .optional()
      .describe("Insertion Order ID (if required for entity type)"),
    lineItemId: z
      .string()
      .optional()
      .describe("Line Item ID (if required for entity type)"),
    adGroupId: z.string().optional().describe("Ad Group ID (if required for entity type)"),
    data: z
      .record(z.any())
      .describe("Entity data to create (validated against entity schema)"),
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
      const missingIds = config.parentIds.filter(
        (id) => !data[id as keyof typeof data]
      );

      return {
        message: `Missing required parent ID(s) for creating ${data.entityType}: ${missingIds.join(", ")}. Required: ${config.parentIds.join(", ")}`,
        path: missingIds,
      };
    }
  )
  .describe("Parameters for creating a DV360 entity");

/**
 * Output schema for create entity tool
 */
export const CreateEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Created entity data"),
    timestamp: z.string().datetime(),
  })
  .describe("Entity creation result");

type CreateEntityInput = z.infer<typeof CreateEntityInputSchema>;
type CreateEntityOutput = z.infer<typeof CreateEntityOutputSchema>;

/**
 * Create entity tool logic
 */
export async function createEntityLogic(
  input: CreateEntityInput,
  context: RequestContext
): Promise<CreateEntityOutput> {
  // Validate entity relationships in data payload
  const missingRelationships = validateEntityRelationships(
    input.entityType,
    input.data
  );

  if (missingRelationships.length > 0) {
    const hierarchy = getEntityHierarchyPath(input.entityType);
    const relationshipDesc = generateRelationshipDescription(input.entityType);

    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Missing required parent relationship field(s) in data: ${missingRelationships.join(", ")}`,
      {
        entityType: input.entityType,
        missingFields: missingRelationships,
        hierarchy: hierarchy.join(" > "),
        hint: relationshipDesc,
        requestId: context?.requestId,
      }
    );
  }

  // Resolve DV360Service from container
  const dv360Service = container.resolve(DV360Service);

  // Extract parent IDs using utility
  const parentIds = extractParentIds(input);

  // Create entity
  const entity = await dv360Service.createEntity(
    input.entityType,
    parentIds,
    input.data,
    context
  );

  return {
    entity: entity as Record<string, any>,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format response for MCP client
 */
export function createEntityResponseFormatter(result: CreateEntityOutput): any {
  return [
    {
      type: "text" as const,
      text: `✓ Entity created successfully\n${JSON.stringify(result.entity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

/**
 * Create Entity Tool Definition
 */
export const createEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CreateEntityInputSchema,
  outputSchema: CreateEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: false,
  },
  logic: createEntityLogic,
  responseFormatter: createEntityResponseFormatter,
};
