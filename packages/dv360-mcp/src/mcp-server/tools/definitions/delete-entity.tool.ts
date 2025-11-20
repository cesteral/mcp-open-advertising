import { z } from "zod";
import { container } from "tsyringe";
import { DV360Service } from "../../../services/dv360/DV360-service.js";
import {
  getSupportedEntityTypesDynamic,
  getEntityConfigDynamic,
} from "../utils/entity-mapping-dynamic.js";
import { extractEntityIds } from "../utils/entity-id-extraction.js";
import type { RequestContext } from "../../../utils/internal/request-context.js";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "dv360_delete_entity";

export const DeleteEntityInputSchema = z
  .object({
    entityType: z.enum(getSupportedEntityTypesDynamic() as [string, ...string[]]),
    partnerId: z.string().optional(),
    advertiserId: z.string().optional(),
    campaignId: z.string().optional(),
    insertionOrderId: z.string().optional(),
    lineItemId: z.string().optional(),
    adGroupId: z.string().optional(),
    adId: z.string().optional(),
    creativeId: z.string().optional(),
    reason: z.string().optional(),
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

      // Validate entity ID is present
      const entityIdField = `${data.entityType}Id` as keyof typeof data;
      if (!data[entityIdField]) {
        return false;
      }

      return true;
    },
    (data) => {
      // Generate helpful error message with specific missing IDs
      const config = getEntityConfigDynamic(data.entityType);
      const entityIdField = `${data.entityType}Id`;

      // Check which parent IDs are missing
      const missingParentIds = config.parentIds.filter((id) => !data[id as keyof typeof data]);

      // Check if entity ID is missing
      const missingEntityId = !data[entityIdField as keyof typeof data] ? [entityIdField] : [];

      const allMissingIds = [...missingParentIds, ...missingEntityId];
      const allRequiredIds = [...config.parentIds, entityIdField];

      return {
        message: `Missing required ID(s) for deleting ${data.entityType}: ${allMissingIds.join(", ")}. Required: ${allRequiredIds.join(", ")}`,
        path: allMissingIds,
      };
    }
  );

export const DeleteEntityOutputSchema = z.object({
  success: z.boolean(),
  deletedEntity: z.record(z.any()),
  timestamp: z.string().datetime(),
});

type DeleteEntityInput = z.infer<typeof DeleteEntityInputSchema>;
type DeleteEntityOutput = z.infer<typeof DeleteEntityOutputSchema>;

export async function deleteEntityLogic(
  input: DeleteEntityInput,
  context: RequestContext,
  _sdkContext?: SdkContext
): Promise<DeleteEntityOutput> {
  const dv360Service = container.resolve(DV360Service);
  const entityIds = extractEntityIds(input, input.entityType);
  const entityBeforeDeletion = (await dv360Service.getEntity(
    input.entityType,
    entityIds,
    context
  )) as Record<string, any>;
  await dv360Service.deleteEntity(input.entityType, entityIds, context);
  return {
    success: true,
    deletedEntity: entityBeforeDeletion,
    timestamp: new Date().toISOString(),
  };
}

export function deleteEntityResponseFormatter(result: DeleteEntityOutput): any {
  return [
    {
      type: "text" as const,
      text: "Entity deleted: " + JSON.stringify(result.deletedEntity, null, 2),
    },
  ];
}

export const deleteEntityTool = {
  name: TOOL_NAME,
  title: "Delete Entity",
  description: "Delete a DV360 entity",
  inputSchema: DeleteEntityInputSchema,
  outputSchema: DeleteEntityOutputSchema,
  annotations: { readOnlyHint: false, openWorldHint: false, idempotentHint: false },
  logic: deleteEntityLogic,
  responseFormatter: deleteEntityResponseFormatter,
};
