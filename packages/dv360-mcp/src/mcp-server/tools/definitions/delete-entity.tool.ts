import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  getSupportedEntityTypesDynamic,
} from "../utils/entity-mapping-dynamic.js";
import { extractEntityIds } from "../utils/entity-id-extraction.js";
import { addIdValidationIssues } from "../utils/parent-id-validation.js";
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
  .superRefine((input, ctx) => {
    addIdValidationIssues(ctx, {
      entityType: input.entityType,
      input: input as Record<string, unknown>,
      operation: "delete",
      requireEntityId: true,
    });
  });

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
  sdkContext?: SdkContext
): Promise<DeleteEntityOutput> {
  const { dv360Service } = resolveSessionServices(sdkContext);
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
