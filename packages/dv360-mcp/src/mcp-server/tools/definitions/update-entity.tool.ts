import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  getSupportedEntityTypesDynamic,
} from "../utils/entity-mapping-dynamic.js";
import { extractEntityIds } from "../utils/entity-id-extraction.js";
import { createSimplifiedUpdateEntityInputSchema } from "../utils/simplified-schemas.js";
import {
  getEntityTypesWithExamples,
  getEntityExamples,
  findMatchingExample,
} from "../utils/entity-examples.js";
import { addIdValidationIssues, mergeIdsIntoData } from "../utils/parent-id-validation.js";
import type { RequestContext } from "@cesteral/shared";
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
    updateMask: z.string().min(1),
    reason: z.string().optional(),
  })
  .superRefine((input, ctx) => {
    const mergedData = mergeIdsIntoData(
      input.entityType,
      input.data as Record<string, unknown>,
      input as Record<string, unknown>
    );
    addIdValidationIssues(ctx, {
      entityType: input.entityType,
      input: input as Record<string, unknown>,
      data: mergedData,
      operation: "update",
      requireEntityId: true,
    });
  });

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
  const mergedData = mergeIdsIntoData(
    validatedInput.entityType,
    validatedInput.data,
    validatedInput as Record<string, unknown>
  );

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
      mergedData,
      validatedInput.updateMask,
      context,
      current
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
  inputExamples: [
    {
      label: "Pause a line item",
      input: {
        entityType: "lineItem",
        advertiserId: "1234567",
        lineItemId: "7654321",
        data: { entityStatus: "ENTITY_STATUS_PAUSED" },
        updateMask: "entityStatus",
        reason: "Pausing for budget review",
      },
    },
    {
      label: "Update insertion order budget",
      input: {
        entityType: "insertionOrder",
        advertiserId: "1234567",
        insertionOrderId: "5555555",
        data: {
          budget: {
            budgetUnit: "BUDGET_UNIT_CURRENCY",
            automationType: "INSERTION_ORDER_AUTOMATION_TYPE_BUDGET",
            budgetSegments: [
              {
                budgetAmountMicros: "75000000000",
                dateRange: { startDate: { year: 2025, month: 1, day: 15 }, endDate: { year: 2025, month: 6, day: 30 } },
              },
            ],
          },
        },
        updateMask: "budget.budgetSegments",
      },
    },
  ],
  annotations: { readOnlyHint: false, openWorldHint: false, idempotentHint: true },
  logic: updateEntityLogic,
  responseFormatter: updateEntityResponseFormatter,
};
