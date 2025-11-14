import { z } from "zod";
import { container } from "tsyringe";
import { DV360Service } from "../../../services/dv360/DV360Service.js";
import { getSupportedEntityTypesDynamic } from "../utils/entityMappingDynamic.js";
import { extractEntityIds } from "../utils/entityIdExtraction.js";
import type { RequestContext } from "../../../utils/internal/requestContext.js";

const TOOL_NAME = "dv360_get_entity";
const TOOL_TITLE = "Get DV360 Entity";
const TOOL_DESCRIPTION =
  "Get a single DV360 entity by ID (supports partners, advertisers, campaigns, insertion orders, line items, ad groups, ads, creatives)";

/**
 * Input schema for get entity tool
 */
export const GetEntityInputSchema = z
  .object({
    entityType: z
      .enum(getSupportedEntityTypesDynamic() as [string, ...string[]])
      .describe("Type of entity to retrieve"),
    partnerId: z.string().optional().describe("Partner ID (if required for entity type)"),
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID (if required for entity type)"),
    campaignId: z.string().optional().describe("Campaign ID (if entity type is campaign)"),
    insertionOrderId: z
      .string()
      .optional()
      .describe("Insertion Order ID (if entity type is insertionOrder)"),
    lineItemId: z.string().optional().describe("Line Item ID (if entity type is lineItem)"),
    adGroupId: z.string().optional().describe("Ad Group ID (if entity type is adGroup)"),
    adId: z.string().optional().describe("Ad ID (if entity type is ad)"),
    creativeId: z.string().optional().describe("Creative ID (if entity type is creative)"),
  })
  .describe("Parameters for getting a DV360 entity");

/**
 * Output schema for get entity tool
 */
export const GetEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Retrieved entity data"),
    timestamp: z.string().datetime(),
  })
  .describe("Entity retrieval result");

type GetEntityInput = z.infer<typeof GetEntityInputSchema>;
type GetEntityOutput = z.infer<typeof GetEntityOutputSchema>;

/**
 * Get entity tool logic
 */
export async function getEntityLogic(
  input: GetEntityInput,
  context: RequestContext
): Promise<GetEntityOutput> {
  // Resolve DV360Service from container
  const dv360Service = container.resolve(DV360Service);

  // Extract entity IDs using utility
  const entityIds = extractEntityIds(input, input.entityType);

  // Fetch entity
  const entity = await dv360Service.getEntity(input.entityType, entityIds, context);

  return {
    entity: entity as Record<string, any>,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format response for MCP client
 */
export function getEntityResponseFormatter(result: GetEntityOutput): any {
  return [
    {
      type: "text" as const,
      text: `✓ Entity retrieved\n${JSON.stringify(result.entity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

/**
 * Get Entity Tool Definition
 */
export const getEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetEntityInputSchema,
  outputSchema: GetEntityOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
  },
  logic: getEntityLogic,
  responseFormatter: getEntityResponseFormatter,
};
