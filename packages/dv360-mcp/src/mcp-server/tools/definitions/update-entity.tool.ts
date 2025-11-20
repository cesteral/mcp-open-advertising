import { z } from "zod";
import { container } from "tsyringe";
import { DV360Service } from "../../../services/dv360/DV360-service.js";
import {
  getSupportedEntityTypesDynamic,
  getEntityConfigDynamic,
} from "../utils/entity-mapping-dynamic.js";
import { extractEntityIds } from "../utils/entity-id-extraction.js";
import {
  getEntityTypesWithExamples,
  getExamplesSummary,
  getEntityExamples,
  findMatchingExample,
} from "../utils/entity-examples.js";
import type { RequestContext } from "../../../utils/internal/request-context.js";
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

// Simplified schema for MCP tool registration (avoids stdio overflow)
//
// WHY SIMPLIFIED: Full discriminated union schemas exceed ~1MB, causing EPIPE errors on stdio transport.
// This simplified version keeps tool registration small (~10KB) while preserving full dynamic functionality.
//
// HOW IT WORKS:
// 1. Tool registration uses generic z.record(z.any()) for data field
// 2. Descriptions guide AI to fetch full schemas and field paths via MCP Resources
// 3. Server-side validation still uses FullUpdateEntityInputSchema (line 41)
// 4. Both simplified and full schemas use same getSupportedEntityTypesDynamic() - fully dynamic!
//
// IMPORTANT: Before attempting to update an entity, fetch resources via:
//   - entity-schema://{entityType} → Complete JSON Schema with all fields
//   - entity-fields://{entityType} → All valid field paths for updateMask
//   - entity-examples://{entityType} → Common update patterns with updateMask examples
const SimplifiedUpdateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getSupportedEntityTypesDynamic() as [string, ...string[]])
      .describe(
        "Type of entity to update. REQUIRED: Fetch field paths first using MCP Resource: " +
          "resources/read entity-fields://{entityType} to see valid updateMask values."
      ),
    partnerId: z.string().optional().describe("Partner ID (if required)"),
    advertiserId: z.string().optional().describe("Advertiser ID (if required)"),
    campaignId: z.string().optional().describe("Campaign ID (if updating campaign)"),
    insertionOrderId: z.string().optional().describe("Insertion Order ID (if updating IO)"),
    lineItemId: z.string().optional().describe("Line Item ID (if updating line item)"),
    adGroupId: z.string().optional().describe("Ad Group ID (if updating ad group)"),
    adId: z.string().optional().describe("Ad ID (if updating ad)"),
    creativeId: z.string().optional().describe("Creative ID (if updating creative)"),
    data: z
      .record(z.any())
      .describe(
        "Partial entity data (only fields being updated). IMPORTANT:\n" +
          "  1. resources/read entity-examples://{entityType} → See common update patterns\n" +
          "  2. Only include fields you want to change\n" +
          "  3. Must match fields specified in updateMask"
      ),
    updateMask: z
      .string()
      .describe(
        "Comma-separated field paths to update (e.g., 'displayName,entityStatus'). " +
          "REQUIRED: Fetch valid paths first using resources/read entity-fields://{entityType}. " +
          "CRITICAL: Only fields in updateMask will be modified on the server."
      ),
    reason: z.string().optional().describe("Optional reason for audit trail"),
  })
  .describe(
    "Update DV360 entity. WORKFLOW:\n" +
      "1. Fetch field paths: resources/read entity-fields://{entityType}\n" +
      "2. Review examples: resources/read entity-examples://{entityType}\n" +
      "3. Build data object with only fields to update\n" +
      "4. Set updateMask to comma-separated field paths\n" +
      "5. Call this tool with entityType + data + updateMask"
  );

// Export simplified schema for MCP
export const UpdateEntityInputSchema = SimplifiedUpdateEntityInputSchema;

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
  // Server-side validation using full schema
  const validatedInput = FullUpdateEntityInputSchema.parse(input);

  const dv360Service = container.resolve(DV360Service);
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
