import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type TikTokEntityType } from "../utils/entity-mapping.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "tiktok_bulk_create_entities";
const TOOL_TITLE = "TikTok Bulk Create Entities";
const TOOL_DESCRIPTION = `Batch create multiple TikTok Ads entities of the same type.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Creates entities sequentially (with concurrency). Each item follows the same
schema as \`tiktok_create_entity\`.

Max 50 items per call. advertiser_id is automatically injected per item.`;

export const BulkCreateEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to create"),
    advertiserId: z
      .string()
      .min(1)
      .describe("TikTok Advertiser ID"),
    items: z
      .array(z.record(z.any()))
      .min(1)
      .max(50)
      .describe("Array of entity data objects to create (max 50)"),
  })
  .describe("Parameters for bulk entity creation");

export const BulkCreateEntitiesOutputSchema = z
  .object({
    totalRequested: z.number(),
    totalSucceeded: z.number(),
    totalFailed: z.number(),
    results: z.array(
      z.object({
        index: z.number(),
        success: z.boolean(),
        entity: z.record(z.any()).optional(),
        error: z.string().optional(),
      })
    ),
    timestamp: z.string().datetime(),
  })
  .describe("Bulk create result");

type BulkCreateEntitiesInput = z.infer<typeof BulkCreateEntitiesInputSchema>;
type BulkCreateEntitiesOutput = z.infer<typeof BulkCreateEntitiesOutputSchema>;

export async function bulkCreateEntitiesLogic(
  input: BulkCreateEntitiesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkCreateEntitiesOutput> {
  const { tiktokService } = resolveSessionServices(sdkContext);

  const bulkResult = await tiktokService.bulkCreateEntities(
    input.entityType as TikTokEntityType,
    input.items,
    context
  );

  const results = bulkResult.results.map((r, i) => ({
    index: i,
    success: r.success,
    entity: r.entity as Record<string, unknown> | undefined,
    error: r.error,
  }));

  const totalSucceeded = results.filter((r) => r.success).length;

  return {
    totalRequested: input.items.length,
    totalSucceeded,
    totalFailed: input.items.length - totalSucceeded,
    results,
    timestamp: new Date().toISOString(),
  };
}

export function bulkCreateEntitiesResponseFormatter(result: BulkCreateEntitiesOutput): unknown[] {
  const lines: string[] = [
    `Bulk create: ${result.totalSucceeded}/${result.totalRequested} succeeded, ${result.totalFailed} failed`,
    "",
  ];

  for (const r of result.results) {
    if (r.success) {
      lines.push(`  [${r.index}]: SUCCESS - ${JSON.stringify(r.entity)}`);
    } else {
      lines.push(`  [${r.index}]: FAILED - ${r.error}`);
    }
  }

  lines.push("", `Timestamp: ${result.timestamp}`);

  return [{ type: "text" as const, text: lines.join("\n") }];
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
      label: "Bulk create campaigns",
      input: {
        entityType: "campaign",
        advertiserId: "1234567890",
        items: [
          {
            campaign_name: "Campaign A",
            objective_type: "TRAFFIC",
            budget_mode: "BUDGET_MODE_DAY",
            budget: 100,
          },
          {
            campaign_name: "Campaign B",
            objective_type: "APP_INSTALLS",
            budget_mode: "BUDGET_MODE_DAY",
            budget: 200,
          },
        ],
      },
    },
  ],
  logic: bulkCreateEntitiesLogic,
  responseFormatter: bulkCreateEntitiesResponseFormatter,
};
