import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  getSupportedEntityTypesDynamic,
} from "../utils/entity-mapping-dynamic.js";
import { extractEntityIds } from "../utils/entity-id-extraction.js";
import { addIdValidationIssues } from "../utils/parent-id-validation.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "dv360_get_entity";
const TOOL_TITLE = "Get DV360 Entity";

function generateToolDescription(): string {
  return `Get a single DV360 entity by ID.

**Entity Hierarchy:**
partner > advertiser > campaign > insertionOrder > lineItem

Supports all entity types: ${getSupportedEntityTypesDynamic().join(", ")}`;
}

const TOOL_DESCRIPTION = generateToolDescription();

/**
 * Input schema for get entity tool with dynamic validation
 * Uses Zod refinement to enforce entity-specific parent ID requirements
 */
export const GetEntityInputSchema = z
  .object({
    entityType: z
      .enum(getSupportedEntityTypesDynamic() as [string, ...string[]])
      .describe("Type of entity to retrieve"),
    partnerId: z.string().optional().describe("Partner ID (if required for entity type)"),
    advertiserId: z.string().optional().describe("Advertiser ID (if required for entity type)"),
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
  .superRefine((input, ctx) => {
    addIdValidationIssues(ctx, {
      entityType: input.entityType,
      input: input as Record<string, unknown>,
      operation: "get",
      requireEntityId: true,
    });
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
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetEntityOutput> {
  // Resolve services for this session
  const { dv360Service } = resolveSessionServices(sdkContext);

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
      text: `[OK] Entity retrieved\n${JSON.stringify(result.entity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
  inputExamples: [
    {
      label: "Get a line item by ID",
      input: {
        entityType: "lineItem",
        advertiserId: "1234567",
        lineItemId: "5678901",
      },
    },
    {
      label: "Get an insertion order by ID",
      input: {
        entityType: "insertionOrder",
        advertiserId: "1234567",
        insertionOrderId: "4445551",
      },
    },
    {
      label: "Get a campaign by ID",
      input: {
        entityType: "campaign",
        advertiserId: "1234567",
        campaignId: "9876543",
      },
    },
  ],
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  },
  logic: getEntityLogic,
  responseFormatter: getEntityResponseFormatter,
};
