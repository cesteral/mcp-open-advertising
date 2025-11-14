import { z } from "zod";
import { container } from "tsyringe";
import { DV360Service } from "../../../services/dv360/DV360Service.js";
import { getSupportedEntityTypesDynamic } from "../utils/entityMappingDynamic.js";
import { extractParentIds } from "../utils/entityIdExtraction.js";
import type { RequestContext } from "../../../utils/internal/requestContext.js";

const TOOL_NAME = "dv360_create_entity";
const TOOL_TITLE = "Create DV360 Entity";
const TOOL_DESCRIPTION =
  "Create a new DV360 entity (supports advertisers, campaigns, insertion orders, line items, ad groups, ads, creatives)";

/**
 * Input schema for create entity tool
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
