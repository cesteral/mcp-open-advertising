import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type CM360EntityType } from "../utils/entity-mapping.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "cm360_bulk_update_entities";
const TOOL_TITLE = "Bulk Update CM360 Entities";
const TOOL_DESCRIPTION = `Batch update multiple CM360 entities of the same type.

Each item must include the id field (CM360 uses PUT/replace semantics). Loops individual update calls with rate limiting. Max 50 items per call.`;

export const BulkUpdateEntitiesInputSchema = z
  .object({
    profileId: z
      .string()
      .min(1)
      .describe("CM360 User Profile ID"),
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to update"),
    items: z
      .array(
        z.object({
          entityId: z.string().min(1).describe("Entity ID to update"),
          data: z.record(z.any()).describe("Full entity data including id field"),
        })
      )
      .min(1)
      .max(50)
      .describe("Array of update items (max 50)"),
  })
  .describe("Parameters for bulk entity update");

export const BulkUpdateEntitiesOutputSchema = z
  .object({
    updated: z.number().describe("Number of entities updated"),
    failed: z.number().describe("Number that failed"),
    results: z.array(
      z.object({
        entityId: z.string(),
        success: z.boolean(),
        entity: z.record(z.any()).optional(),
        error: z.string().optional(),
      })
    ).describe("Per-item results"),
    timestamp: z.string().datetime(),
  })
  .describe("Bulk update result");

type BulkUpdateEntitiesInput = z.infer<typeof BulkUpdateEntitiesInputSchema>;
type BulkUpdateEntitiesOutput = z.infer<typeof BulkUpdateEntitiesOutputSchema>;

export async function bulkUpdateEntitiesLogic(
  input: BulkUpdateEntitiesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkUpdateEntitiesOutput> {
  const { cm360Service } = resolveSessionServices(sdkContext);

  const results: BulkUpdateEntitiesOutput["results"] = [];
  let updated = 0;
  let failed = 0;

  for (const item of input.items) {
    try {
      const data = { ...item.data, id: item.entityId };
      const entity = await cm360Service.updateEntity(
        input.entityType as CM360EntityType,
        input.profileId,
        data,
        context
      );
      results.push({ entityId: item.entityId, success: true, entity: entity as Record<string, any> });
      updated++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ entityId: item.entityId, success: false, error: message });
      failed++;
    }
  }

  return {
    updated,
    failed,
    results,
    timestamp: new Date().toISOString(),
  };
}

export function bulkUpdateEntitiesResponseFormatter(result: BulkUpdateEntitiesOutput): unknown[] {
  const summary = `Bulk update: ${result.updated} succeeded, ${result.failed} failed`;
  const failures = result.results
    .filter((r) => !r.success)
    .map((r) => `  - ${r.entityId}: ${r.error}`)
    .join("\n");
  const failureDetails = failures ? `\n\nFailures:\n${failures}` : "";

  return [
    {
      type: "text" as const,
      text: `${summary}${failureDetails}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const bulkUpdateEntitiesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BulkUpdateEntitiesInputSchema,
  outputSchema: BulkUpdateEntitiesOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Update multiple campaign names",
      input: {
        profileId: "123456",
        entityType: "campaign",
        items: [
          {
            entityId: "111",
            data: { id: "111", name: "Campaign A - Updated", advertiserId: "789" },
          },
          {
            entityId: "222",
            data: { id: "222", name: "Campaign B - Updated", advertiserId: "789" },
          },
        ],
      },
    },
  ],
  logic: bulkUpdateEntitiesLogic,
  responseFormatter: bulkUpdateEntitiesResponseFormatter,
};
