import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getBulkEntityTypeEnum, type TtdEntityType } from "../utils/entity-mapping.js";
import {
  addParentValidationIssue,
  mergeParentIdsIntoData,
} from "../utils/parent-id-validation.js";
import { BulkOperationResultSchema } from "@cesteral/shared";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "ttd_bulk_update_entities";
const TOOL_TITLE = "Bulk Update TTD Entities";
const TOOL_DESCRIPTION = `Update multiple The Trade Desk entities of the same type in a single batch operation.

**Supported entity types for bulk update:** ${getBulkEntityTypeEnum().join(", ")}

Provide an array of update items, each with an entityId and data payload. Uses TTD PUT semantics (full entity replacement). Partial failures are reported per-item.

**Important:** TTD uses PUT for updates — include ALL fields you want to keep, not just changed ones. Consider GETting each entity first to merge changes.`;

export const BulkUpdateEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getBulkEntityTypeEnum())
      .describe("Type of entities to update (campaign or adGroup)"),
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID for all items (required for campaign/adGroup)"),
    campaignId: z
      .string()
      .optional()
      .describe("Campaign ID for all items (required for adGroup)"),
    items: z
      .array(
        z.object({
          entityId: z.string().min(1).describe("Entity ID to update"),
          data: z.record(z.any()).describe("Entity data fields to update"),
        })
      )
      .min(1)
      .max(50)
      .describe("Array of update items (max 50)"),
  })
  .superRefine((input, ctx) => {
    input.items.forEach((item, index) => {
      addParentValidationIssue(
        ctx,
        input.entityType as TtdEntityType,
        input as Record<string, unknown>,
        item.data,
        ["items", index]
      );
    });
  })
  .describe("Parameters for bulk updating TTD entities");

export const BulkUpdateEntitiesOutputSchema = z
  .object({
    entityType: z.string(),
    totalRequested: z.number(),
    successCount: z.number(),
    failureCount: z.number(),
    results: z.array(BulkOperationResultSchema),
    timestamp: z.string().datetime(),
  })
  .describe("Bulk entity update results");

type BulkUpdateInput = z.infer<typeof BulkUpdateEntitiesInputSchema>;
type BulkUpdateOutput = z.infer<typeof BulkUpdateEntitiesOutputSchema>;

export async function bulkUpdateEntitiesLogic(
  input: BulkUpdateInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkUpdateOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);
  const items = input.items.map((item) => ({
    ...item,
    data: mergeParentIdsIntoData(item.data, input as Record<string, unknown>),
  }));

  const { results } = await ttdService.bulkUpdateEntities(
    input.entityType as TtdEntityType,
    items,
    context
  );

  const succeeded = results.filter((r) => r.success).length;

  return {
    entityType: input.entityType,
    totalRequested: items.length,
    successCount: succeeded,
    failureCount: items.length - succeeded,
    results: results.map((r) => ({
      success: r.success,
      entity: r.entity as Record<string, any> | undefined,
      error: r.error,
    })),
    timestamp: new Date().toISOString(),
  };
}

export function bulkUpdateEntitiesResponseFormatter(result: BulkUpdateOutput): any {
  return [
    {
      type: "text" as const,
      text: `Bulk update ${result.entityType}: ${result.successCount}/${result.totalRequested} succeeded, ${result.failureCount} failed\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Update 2 ad groups with new bid CPMs",
      input: {
        entityType: "adGroup",
        advertiserId: "adv123abc",
        campaignId: "camp456def",
        items: [
          {
            entityId: "adg111aaa",
            data: {
              AdGroupName: "Prospecting - Display",
              RTBAttributes: {
                BudgetSettings: { DailyBudget: { Amount: 600, CurrencyCode: "USD" } },
                BaseBidCPM: { Amount: 4.0, CurrencyCode: "USD" },
              },
            },
          },
          {
            entityId: "adg222bbb",
            data: {
              AdGroupName: "Prospecting - Video",
              RTBAttributes: {
                BudgetSettings: { DailyBudget: { Amount: 1200, CurrencyCode: "USD" } },
                BaseBidCPM: { Amount: 9.5, CurrencyCode: "USD" },
              },
            },
          },
        ],
      },
    },
    {
      label: "Update 2 campaigns with new budgets",
      input: {
        entityType: "campaign",
        advertiserId: "adv123abc",
        items: [
          {
            entityId: "camp456def",
            data: {
              CampaignName: "Q1 Brand Awareness",
              Budget: { Amount: 75000, CurrencyCode: "USD" },
              StartDate: "2025-01-01T00:00:00Z",
              EndDate: "2025-03-31T23:59:59Z",
              PacingMode: "PaceEvenly",
            },
          },
          {
            entityId: "camp789ghi",
            data: {
              CampaignName: "Q1 Retargeting",
              Budget: { Amount: 30000, CurrencyCode: "USD" },
              StartDate: "2025-01-01T00:00:00Z",
              EndDate: "2025-03-31T23:59:59Z",
              PacingMode: "PaceAhead",
            },
          },
        ],
      },
    },
  ],
  logic: bulkUpdateEntitiesLogic,
  responseFormatter: bulkUpdateEntitiesResponseFormatter,
};
