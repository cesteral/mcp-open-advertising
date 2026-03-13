import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type GAdsEntityType } from "../utils/entity-mapping.js";
import { addParentValidationIssue } from "../utils/parent-id-validation.js";
import { BulkOperationResultSchema } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "gads_bulk_create_entities";
const TOOL_TITLE = "Bulk Create Google Ads Entities";
const TOOL_DESCRIPTION = `Batch create multiple entities of the same type in a single API call.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Simpler alternative to \`gads_bulk_mutate\` when you only need to create entities.
Each item in \`items\` is the entity data object (same format as \`gads_create_entity\`).

- Max 50 items per call.
- Uses \`partialFailure: true\` so individual items can fail without aborting the batch.
- Returns per-item success/failure results.

**Important**: For campaigns, create campaignBudgets first and reference them via the \`campaignBudget\` field.`;

export const BulkCreateEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to create"),
    customerId: z
      .string()
      .min(1)
      .describe("Google Ads customer ID (no dashes)"),
    items: z
      .array(z.record(z.any()))
      .min(1)
      .max(50)
      .describe(
        "Array of entity data objects to create (max 50). Each object has the same shape as gads_create_entity data."
      ),
  })
  .superRefine((input, ctx) => {
    addParentValidationIssue(
      ctx,
      input.entityType as GAdsEntityType,
      input as Record<string, unknown>
    );
  })
  .describe("Parameters for bulk entity creation");

export const BulkCreateEntitiesOutputSchema = z
  .object({
    results: z.array(BulkOperationResultSchema),
    successCount: z.number(),
    failureCount: z.number(),
    timestamp: z.string().datetime(),
  })
  .describe("Bulk creation result");

type BulkCreateEntitiesInput = z.infer<typeof BulkCreateEntitiesInputSchema>;
type BulkCreateEntitiesOutput = z.infer<typeof BulkCreateEntitiesOutputSchema>;

export async function bulkCreateEntitiesLogic(
  input: BulkCreateEntitiesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkCreateEntitiesOutput> {
  const { gadsService } = resolveSessionServices(sdkContext);

  // Convert items to bulk mutate create operations
  const operations = input.items.map((item) => ({ create: item }));

  const apiResult = (await gadsService.bulkMutate(
    input.entityType as GAdsEntityType,
    input.customerId,
    operations,
    true, // partialFailure
    context
  )) as Record<string, unknown>;

  // Map API response to BulkOperationResult format
  const mutateResults = (apiResult?.results ?? []) as Array<Record<string, unknown>>;
  const partialErrors = (apiResult?.partialFailureError as Record<string, unknown>) ?? null;
  const errorDetails = (partialErrors?.details ?? []) as Array<Record<string, unknown>>;

  // Build a map of operation index → error message from partial failure details
  const errorsByIndex = new Map<number, string>();
  for (const detail of errorDetails) {
    const errors = (detail?.errors ?? []) as Array<Record<string, unknown>>;
    for (const err of errors) {
      const location = err?.location as Record<string, unknown> | undefined;
      const fieldPathElements = (location?.fieldPathElements ?? []) as Array<
        Record<string, unknown>
      >;
      // The first element with index indicates the operation index
      const opElement = fieldPathElements.find(
        (el) => el.fieldName === "operations" && el.index != null
      );
      const opIndex = opElement ? Number(opElement.index) : -1;
      const message =
        (err?.message as string) ??
        (err?.errorCode
          ? JSON.stringify(err.errorCode)
          : "Unknown error");
      if (opIndex >= 0) {
        errorsByIndex.set(opIndex, message);
      }
    }
  }

  const results = input.items.map((_item, index) => {
    const error = errorsByIndex.get(index);
    if (error) {
      return { success: false, error };
    }

    const mutateResult = mutateResults[index] as Record<string, unknown> | undefined;
    const resourceName =
      (mutateResult?.resourceName as string) ??
      // Some entity types nest the result (e.g., campaignBudgetResult.resourceName)
      extractResourceName(mutateResult);

    return {
      success: true,
      entity: resourceName ? { resourceName } : mutateResult ?? {},
    };
  });

  const successCount = results.filter((r) => r.success).length;

  return {
    results,
    successCount,
    failureCount: results.length - successCount,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Extract resourceName from nested result objects like
 * { campaignBudgetResult: { resourceName: "..." } }
 */
function extractResourceName(
  result: Record<string, unknown> | undefined
): string | undefined {
  if (!result) return undefined;
  for (const value of Object.values(result)) {
    if (
      value &&
      typeof value === "object" &&
      "resourceName" in (value as Record<string, unknown>)
    ) {
      return (value as Record<string, unknown>).resourceName as string;
    }
  }
  return undefined;
}

export function bulkCreateEntitiesResponseFormatter(
  result: BulkCreateEntitiesOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Bulk create: ${result.successCount} succeeded, ${result.failureCount} failed\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const bulkCreateEntitiesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BulkCreateEntitiesInputSchema,
  outputSchema: BulkCreateEntitiesOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: true,
  },
  inputExamples: [
    {
      label: "Create 2 campaign budgets",
      input: {
        entityType: "campaignBudget",
        customerId: "1234567890",
        items: [
          {
            name: "Q1 2025 Brand Budget",
            amountMicros: "50000000000",
            deliveryMethod: "STANDARD",
          },
          {
            name: "Q1 2025 Generic Budget",
            amountMicros: "30000000000",
            deliveryMethod: "STANDARD",
          },
        ],
      },
    },
  ],
  logic: bulkCreateEntitiesLogic,
  responseFormatter: bulkCreateEntitiesResponseFormatter,
};
