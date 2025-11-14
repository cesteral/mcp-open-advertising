import { z } from "zod";
import { container } from "tsyringe";
import { DV360Service } from "../../../services/dv360/DV360Service.js";
import { getSupportedEntityTypesDynamic } from "../utils/entityMappingDynamic.js";
import { extractEntityIds } from "../utils/entityIdExtraction.js";
import type { RequestContext } from "../../../utils/internal/requestContext.js";

const TOOL_NAME = "dv360_update_entity";

export const UpdateEntityInputSchema = z.object({
  entityType: z.enum(getSupportedEntityTypesDynamic() as [string, ...string[]]),
  partnerId: z.string().optional(),
  advertiserId: z.string().optional(),
  campaignId: z.string().optional(),
  insertionOrderId: z.string().optional(),
  lineItemId: z.string().optional(),
  adGroupId: z.string().optional(),
  adId: z.string().optional(),
  creativeId: z.string().optional(),
  data: z.record(z.any()),
  updateMask: z.string(),
  reason: z.string().optional(),
});

export const UpdateEntityOutputSchema = z.object({
  entity: z.record(z.any()),
  previousValues: z.record(z.any()).optional(),
  timestamp: z.string().datetime(),
});

type UpdateEntityInput = z.infer<typeof UpdateEntityInputSchema>;
type UpdateEntityOutput = z.infer<typeof UpdateEntityOutputSchema>;

export async function updateEntityLogic(input: UpdateEntityInput, context: RequestContext): Promise<UpdateEntityOutput> {
  const dv360Service = container.resolve(DV360Service);
  const entityIds = extractEntityIds(input, input.entityType);
  const current = await dv360Service.getEntity(input.entityType, entityIds, context) as Record<string, any>;
  const updateFields = input.updateMask.split(",").map(f => f.trim());
  const previousValues: Record<string, any> = {};
  for (const field of updateFields) {
    const parts = field.split(".");
    let value: any = current;
    for (const part of parts) { value = value?.[part]; }
    previousValues[field] = value;
  }
  const updated = await dv360Service.updateEntity(input.entityType, entityIds, input.data, input.updateMask, context);
  return { entity: updated as Record<string, any>, previousValues, timestamp: new Date().toISOString() };
}

export function updateEntityResponseFormatter(result: UpdateEntityOutput): any {
  return [{ type: "text" as const, text: "Entity updated: " + JSON.stringify(result.entity, null, 2) }];
}

export const updateEntityTool = {
  name: TOOL_NAME,
  title: "Update Entity",
  description: "Update a DV360 entity",
  inputSchema: UpdateEntityInputSchema,
  outputSchema: UpdateEntityOutputSchema,
  annotations: { readOnlyHint: false, openWorldHint: false, idempotentHint: true },
  logic: updateEntityLogic,
  responseFormatter: updateEntityResponseFormatter,
};
