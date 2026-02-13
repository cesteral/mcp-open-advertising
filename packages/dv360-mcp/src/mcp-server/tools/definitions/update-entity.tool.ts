import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  getSupportedEntityTypesDynamic,
  getEntityConfigDynamic,
} from "../utils/entity-mapping-dynamic.js";
import { extractEntityIds } from "../utils/entity-id-extraction.js";
import { createSimplifiedUpdateEntityInputSchema } from "../utils/simplified-schemas.js";
import {
  getEntityTypesWithExamples,
  getEntityExamples,
  findMatchingExample,
} from "../utils/entity-examples.js";
import type { RequestContext } from "../../../utils/internal/request-context.js";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "dv360_update_entity";

// Generate dynamic description with examples and hierarchy
function generateToolDescription(): string {
  const typesWithExamples = getEntityTypesWithExamples().slice(0, 6).join(", ");
  const examplesHint =
    typesWithExamples.length > 0 ? ` Common examples available for: ${typesWithExamples}.` : "";
  return (
    "Update a DV360 entity using partial data plus updateMask. Fetch entity-fields://{entityType} and entity-examples://{entityType} before calling." +
    examplesHint
  );
}

// Full validation schema (with refine logic)
const FullUpdateEntityInputSchema = z
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
      const missingParentIds = config.parentIds.filter((id) => !data[id as keyof typeof data]);

      // Check if entity ID is missing
      const missingEntityId = !data[entityIdField as keyof typeof data] ? [entityIdField] : [];

      const allMissingIds = [...missingParentIds, ...missingEntityId];
      const allRequiredIds = [...config.parentIds, entityIdField];

      return {
        message: `Missing required ID(s) for updating ${data.entityType}: ${allMissingIds.join(", ")}. Required: ${allRequiredIds.join(", ")}`,
        path: allMissingIds,
      };
    }
  );

// Export simplified schema for MCP
export const UpdateEntityInputSchema = createSimplifiedUpdateEntityInputSchema().describe(
  "Update DV360 entity. Fetch entity-fields://{entityType} and entity-examples://{entityType} first."
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
  sdkContext?: SdkContext
): Promise<UpdateEntityOutput> {
  // Server-side validation using full schema
  const validatedInput = FullUpdateEntityInputSchema.parse(input);

  const { dv360Service } = resolveSessionServices(sdkContext);
  const entityIds = extractEntityIds(validatedInput, validatedInput.entityType);

  try {
    const current = (await dv360Service.getEntity(
      validatedInput.entityType,
      entityIds,
      context
    )) as Record<string, any>;
    const updateFields = validatedInput.updateMask.split(",").map((f) => f.trim());
    const previousValues: Record<string, any> = {};
    for (const field of updateFields) {
      const parts = field.split(".");
      let value: any = current;
      for (const part of parts) {
        value = value?.[part];
      }
      previousValues[field] = value;
    }
    const updated = await dv360Service.updateEntity(
      validatedInput.entityType,
      entityIds,
      validatedInput.data,
      validatedInput.updateMask,
      context
    );
    return {
      entity: updated as Record<string, any>,
      previousValues,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    // Enhance error message with example suggestions
    const examples = getEntityExamples(validatedInput.entityType);

    if (examples.length > 0) {
      const exampleSuggestions = examples
        .slice(0, 3)
        .map((ex) => `  - ${ex.operation}: updateMask="${ex.updateMask}"`)
        .join("\n");

      const enhancedMessage = `${error.message}\n\nTip: Try one of these common patterns for ${validatedInput.entityType}:\n${exampleSuggestions}`;
      error.message = enhancedMessage;
    }

    throw error;
  }
}

export function updateEntityResponseFormatter(
  result: UpdateEntityOutput,
  input?: UpdateEntityInput
): any {
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
