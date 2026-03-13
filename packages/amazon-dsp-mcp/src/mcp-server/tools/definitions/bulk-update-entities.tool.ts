import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type AmazonDspEntityType } from "../utils/entity-mapping.js";
import { BulkOperationResultSchema } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "amazon_dsp_bulk_update_entities";
const TOOL_TITLE = "AmazonDsp Bulk Update Entities";
const TOOL_DESCRIPTION = `Batch update multiple AmazonDsp Ads entities of the same type.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Each item must include an \`entityId\` and a \`data\` object with fields to update.
Updates are applied concurrently (max concurrency 5). profile_id is automatically injected.

Max 50 items per call.`;

export const BulkUpdateEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to update"),
    profileId: z
      .string()
      .min(1)
      .describe("AmazonDsp Advertiser ID"),
    items: z
      .array(
        z.object({
          entityId: z.string().min(1).describe("Entity ID to update"),
          data: z.record(z.any()).describe("Fields to update"),
        })
      )
      .min(1)
      .max(50)
      .describe("Array of update operations (max 50)"),
  })
  .describe("Parameters for bulk entity updates");

export const BulkUpdateEntitiesOutputSchema = z
  .object({
    totalRequested: z.number(),
    successCount: z.number(),
    failureCount: z.number(),
    results: z.array(
      BulkOperationResultSchema.extend({
        entityId: z.string(),
      })
    ),
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
  const { amazonDspService } = resolveSessionServices(sdkContext);

  const bulkResult = await amazonDspService.bulkUpdateEntities(
    input.entityType as AmazonDspEntityType,
    input.items,
    context
  );

  const totalSucceeded = bulkResult.results.filter((r) => r.success).length;

  return {
    totalRequested: input.items.length,
    successCount: totalSucceeded,
    failureCount: input.items.length - totalSucceeded,
    results: bulkResult.results,
    timestamp: new Date().toISOString(),
  };
}

export function bulkUpdateEntitiesResponseFormatter(result: BulkUpdateEntitiesOutput): McpTextContent[] {
  const lines: string[] = [
    `Bulk update: ${result.successCount}/${result.totalRequested} succeeded, ${result.failureCount} failed`,
    "",
  ];

  for (const r of result.results) {
    if (r.success) {
      lines.push(`  ${r.entityId}: SUCCESS`);
    } else {
      lines.push(`  ${r.entityId}: FAILED - ${r.error}`);
    }
  }

  lines.push("", `Timestamp: ${result.timestamp}`);

  return [{ type: "text" as const, text: lines.join("\n") }];
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
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Bulk update order (campaign) budgets",
      input: {
        entityType: "order",
        profileId: "1234567890",
        items: [
          { entityId: "ord_111111", data: { budget: 15000 } },
          { entityId: "ord_222222", data: { budget: 25000 } },
        ],
      },
    },
  ],
  logic: bulkUpdateEntitiesLogic,
  responseFormatter: bulkUpdateEntitiesResponseFormatter,
};
