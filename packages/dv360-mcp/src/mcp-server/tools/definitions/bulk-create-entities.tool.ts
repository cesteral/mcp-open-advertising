import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getSupportedEntityTypesDynamic } from "../utils/entity-mapping-dynamic.js";
import { extractParentIds } from "../utils/entity-id-extraction.js";
import { mergeIdsIntoData } from "../utils/parent-id-validation.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "dv360_bulk_create_entities";
const TOOL_TITLE = "Bulk Create DV360 Entities";

const TOOL_DESCRIPTION =
  "Batch create up to 50 DV360 entities of the same type. " +
  "Loops through items individually (DV360 API has no native batch endpoint). " +
  "Returns partial success results — failed items do not block remaining creates. " +
  "Fetch entity-schema://{entityType} and entity-examples://{entityType} before calling.";

/**
 * Input schema for bulk create entities tool
 */
export const BulkCreateEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getSupportedEntityTypesDynamic() as [string, ...string[]])
      .describe("Type of entities to create. Fetch entity-schema://{entityType} for required fields."),
    advertiserId: z
      .string()
      .min(1)
      .describe("Advertiser ID (required for advertiser-scoped entities)"),
    items: z
      .array(z.record(z.any()))
      .min(1)
      .max(50)
      .describe(
        "Array of entity data payloads to create (max 50). " +
          "Each item follows the same schema as dv360_create_entity data field."
      ),
    reason: z
      .string()
      .optional()
      .describe("Reason for bulk creation (audit trail)"),
  })
  .describe("Parameters for bulk creating DV360 entities");

/**
 * Output schema for bulk create entities tool
 */
export const BulkCreateEntitiesOutputSchema = z
  .object({
    entityType: z.string().describe("Type of entities created"),
    totalRequested: z.number().describe("Total items requested"),
    totalSucceeded: z.number().describe("Total items successfully created"),
    totalFailed: z.number().describe("Total items that failed"),
    successCount: z.number().describe("Alias for totalSucceeded"),
    failureCount: z.number().describe("Alias for totalFailed"),
    results: z
      .array(
        z.object({
          index: z.number().describe("Index of the item in the input array"),
          success: z.boolean().describe("Whether this item was created successfully"),
          entity: z.record(z.any()).optional().describe("Created entity data (on success)"),
          error: z.string().optional().describe("Error message (on failure)"),
        })
      )
      .describe("Per-item results"),
    timestamp: z.string().datetime(),
  })
  .describe("Bulk create entities result");

type BulkCreateEntitiesInput = z.infer<typeof BulkCreateEntitiesInputSchema>;
type BulkCreateEntitiesOutput = z.infer<typeof BulkCreateEntitiesOutputSchema>;

/**
 * Bulk create entities tool logic
 */
export async function bulkCreateEntitiesLogic(
  input: BulkCreateEntitiesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkCreateEntitiesOutput> {
  const { dv360Service } = resolveSessionServices(sdkContext);

  const results: BulkCreateEntitiesOutput["results"] = [];
  let totalSucceeded = 0;
  let totalFailed = 0;

  for (let i = 0; i < input.items.length; i++) {
    const itemData = input.items[i];

    try {
      // Merge advertiserId (and any other parent IDs) into each item's data
      const mergedData = mergeIdsIntoData(
        input.entityType,
        itemData as Record<string, unknown>,
        { advertiserId: input.advertiserId } as Record<string, unknown>
      );

      // Build entityIds from the input-level parent IDs
      const entityIds = extractParentIds({
        advertiserId: input.advertiserId,
      });

      const entity = await dv360Service.createEntity(
        input.entityType,
        entityIds,
        mergedData,
        context
      );

      results.push({
        index: i,
        success: true,
        entity: entity as Record<string, any>,
      });
      totalSucceeded++;
    } catch (error: any) {
      results.push({
        index: i,
        success: false,
        error: error.message || String(error),
      });
      totalFailed++;
    }
  }

  return {
    entityType: input.entityType,
    totalRequested: input.items.length,
    totalSucceeded,
    totalFailed,
    successCount: totalSucceeded,
    failureCount: totalFailed,
    results,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format response for MCP client
 */
export function bulkCreateEntitiesResponseFormatter(
  result: BulkCreateEntitiesOutput
): any {
  const summary = `Bulk create ${result.entityType}: ${result.totalSucceeded}/${result.totalRequested} succeeded, ${result.totalFailed} failed`;

  const successResults = result.results.filter((r) => r.success);
  const failedResults = result.results.filter((r) => !r.success);

  let responseText = summary;

  if (successResults.length > 0) {
    responseText += `\n\nSuccessful creates:\n${JSON.stringify(successResults, null, 2)}`;
  }

  if (failedResults.length > 0) {
    responseText += `\n\nFailed creates:\n${JSON.stringify(failedResults, null, 2)}`;
  }

  responseText += `\n\nTimestamp: ${result.timestamp}`;

  return [
    {
      type: "text" as const,
      text: responseText,
    },
  ];
}

/**
 * Bulk Create Entities Tool Definition
 */
export const bulkCreateEntitiesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BulkCreateEntitiesInputSchema,
  outputSchema: BulkCreateEntitiesOutputSchema,
  inputExamples: [
    {
      label: "Bulk create line items",
      input: {
        entityType: "lineItem",
        advertiserId: "1234567",
        items: [
          {
            displayName: "LI - Display Prospecting",
            insertionOrderId: "9876543",
            entityStatus: "ENTITY_STATUS_DRAFT",
            lineItemType: "LINE_ITEM_TYPE_DISPLAY_DEFAULT",
            budget: {
              budgetAllocationType: "LINE_ITEM_BUDGET_ALLOCATION_TYPE_AUTOMATIC",
            },
            pacing: {
              pacingPeriod: "PACING_PERIOD_FLIGHT",
              pacingType: "PACING_TYPE_EVEN",
            },
            bidStrategy: {
              fixedBid: { bidAmountMicros: "5000000" },
            },
          },
          {
            displayName: "LI - Display Retargeting",
            insertionOrderId: "9876543",
            entityStatus: "ENTITY_STATUS_DRAFT",
            lineItemType: "LINE_ITEM_TYPE_DISPLAY_DEFAULT",
            budget: {
              budgetAllocationType: "LINE_ITEM_BUDGET_ALLOCATION_TYPE_AUTOMATIC",
            },
            pacing: {
              pacingPeriod: "PACING_PERIOD_FLIGHT",
              pacingType: "PACING_TYPE_EVEN",
            },
            bidStrategy: {
              fixedBid: { bidAmountMicros: "3000000" },
            },
          },
        ],
        reason: "Campaign launch — creating line items for Q1 flight",
      },
    },
    {
      label: "Bulk create campaigns",
      input: {
        entityType: "campaign",
        advertiserId: "1234567",
        items: [
          {
            displayName: "Q1 2025 - Brand Awareness",
            entityStatus: "ENTITY_STATUS_ACTIVE",
            campaignGoal: {
              campaignGoalType: "CAMPAIGN_GOAL_TYPE_BRAND_AWARENESS",
              performanceGoal: {
                performanceGoalType: "PERFORMANCE_GOAL_TYPE_CPM",
                performanceGoalAmountMicros: "5000000",
              },
            },
            campaignFlight: {
              plannedSpendAmountMicros: "100000000000",
              plannedDates: { startDate: { year: 2025, month: 1, day: 15 } },
            },
          },
          {
            displayName: "Q1 2025 - Performance",
            entityStatus: "ENTITY_STATUS_ACTIVE",
            campaignGoal: {
              campaignGoalType: "CAMPAIGN_GOAL_TYPE_DRIVE_ONLINE_ACTION",
              performanceGoal: {
                performanceGoalType: "PERFORMANCE_GOAL_TYPE_CPA",
                performanceGoalAmountMicros: "10000000",
              },
            },
            campaignFlight: {
              plannedSpendAmountMicros: "200000000000",
              plannedDates: { startDate: { year: 2025, month: 1, day: 15 } },
            },
          },
        ],
        reason: "New advertiser onboarding — creating Q1 campaigns",
      },
    },
  ],
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  logic: bulkCreateEntitiesLogic,
  responseFormatter: bulkCreateEntitiesResponseFormatter,
};
