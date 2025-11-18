import { z } from "zod";
import { container } from "tsyringe";
import { DV360Service } from "../../../services/dv360/DV360Service.js";
import {
  getSupportedEntityTypesDynamic,
  getEntityConfigDynamic,
} from "../utils/entityMappingDynamic.js";
import { extractEntityIds } from "../utils/entityIdExtraction.js";
import { getEntityTypesWithExamples, getExamplesSummary, getEntityExamples, findMatchingExample } from "../utils/entityExamples.js";
import type { RequestContext } from "../../../utils/internal/requestContext.js";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "dv360_update_entity";

// Generate dynamic description with examples and hierarchy
function generateToolDescription(): string {
  const baseDescription = `Update a DV360 entity with flexible field updates.

Use this tool to update any field on any entity type. Specify the data to update and the updateMask indicating which fields to update.

**Entity Hierarchy:**
partner > advertiser > campaign > insertionOrder > lineItem

**Important:** Ensure you have the correct parent IDs when updating entities.

**Common Update Patterns:**`;

  const entityTypesWithExamples = getEntityTypesWithExamples();
  const exampleSummaries = entityTypesWithExamples
    .slice(0, 3) // Show top 3 entities with most examples
    .map((entityType) => {
      const summary = getExamplesSummary(entityType);
      return `\n\n${summary}`;
    })
    .join("");

  return baseDescription + exampleSummaries + `\n\nFor more examples, see entity examples utility.`;
}

export const UpdateEntityInputSchema = z
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
    data: z.record(z.any()),
    updateMask: z.string(),
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
      const missingParentIds = config.parentIds.filter(
        (id) => !data[id as keyof typeof data]
      );

      // Check if entity ID is missing
      const missingEntityId = !data[entityIdField as keyof typeof data]
        ? [entityIdField]
        : [];

      const allMissingIds = [...missingParentIds, ...missingEntityId];
      const allRequiredIds = [...config.parentIds, entityIdField];

      return {
        message: `Missing required ID(s) for updating ${data.entityType}: ${allMissingIds.join(", ")}. Required: ${allRequiredIds.join(", ")}`,
        path: allMissingIds,
      };
    }
  );

export const UpdateEntityOutputSchema = z.object({
  entity: z.record(z.any()),
  previousValues: z.record(z.any()).optional(),
  timestamp: z.string().datetime(),
});

type UpdateEntityInput = z.infer<typeof UpdateEntityInputSchema>;
type UpdateEntityOutput = z.infer<typeof UpdateEntityOutputSchema>;

export async function updateEntityLogic(
  input: UpdateEntityInput,
  context: RequestContext,
  _sdkContext?: SdkContext
): Promise<UpdateEntityOutput> {
  const dv360Service = container.resolve(DV360Service);
  const entityIds = extractEntityIds(input, input.entityType);

  try {
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
  } catch (error: any) {
    // Enhance error message with example suggestions
    const examples = getEntityExamples(input.entityType);

    if (examples.length > 0) {
      const exampleSuggestions = examples
        .slice(0, 3)
        .map((ex) => `  - ${ex.operation}: updateMask="${ex.updateMask}"`)
        .join("\n");

      const enhancedMessage = `${error.message}\n\nTip: Try one of these common patterns for ${input.entityType}:\n${exampleSuggestions}`;
      error.message = enhancedMessage;
    }

    throw error;
  }
}

export function updateEntityResponseFormatter(result: UpdateEntityOutput, input?: UpdateEntityInput): any {
  let responseText = "Entity updated successfully:\n" + JSON.stringify(result.entity, null, 2);

  // Add helpful note if this matches a known pattern
  if (input) {
    const matchingExample = findMatchingExample(input.entityType, input.data, input.updateMask);
    if (matchingExample) {
      responseText += `\n\n✓ Applied pattern: ${matchingExample.operation}\n`;
      responseText += `Note: ${matchingExample.notes}`;
    }
  }

  return [{ type: "text" as const, text: responseText }];
}

export const updateEntityTool = {
  name: TOOL_NAME,
  title: "Update Entity",
  description: generateToolDescription(),
  inputSchema: UpdateEntityInputSchema,
  outputSchema: UpdateEntityOutputSchema,
  annotations: { readOnlyHint: false, openWorldHint: false, idempotentHint: true },
  logic: updateEntityLogic,
  responseFormatter: updateEntityResponseFormatter,
};
