import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getSupportedEntityTypesDynamic } from "../utils/entity-mapping-dynamic.js";
import { extractEntityIds } from "../utils/entity-id-extraction.js";
import { mergeIdsIntoData } from "../utils/parent-id-validation.js";
import { BulkOperationResultSchema } from "@cesteral/shared";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "dv360_bulk_update_entities";
const TOOL_TITLE = "Bulk Update DV360 Entities";

const TOOL_DESCRIPTION =
  "Batch update up to 50 DV360 entities with updateMask discipline. " +
  "Loops through items individually (DV360 API has no native batch endpoint). " +
  "Returns partial success results — failed items do not block remaining updates. " +
  "Fetch entity-fields://{entityType} and entity-examples://{entityType} before calling.";

/**
 * Input schema for bulk update entities tool
 */
export const BulkUpdateEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getSupportedEntityTypesDynamic() as [string, ...string[]])
      .describe("Type of entities to update. Fetch entity-fields://{entityType} for valid updateMask paths."),
    advertiserId: z
      .string()
      .min(1)
      .describe("Advertiser ID (required for advertiser-scoped entities)"),
    items: z
      .array(
        z.object({
          entityId: z.string().min(1).describe("ID of the entity to update"),
          data: z
            .record(z.any())
            .describe("Partial payload containing only the fields to update"),
          updateMask: z
            .string()
            .min(1)
            .describe("Comma-separated field paths to update (e.g. displayName,entityStatus)"),
        })
      )
      .min(1)
      .max(50)
      .describe(
        "Array of update items (max 50). Each item specifies entityId, data payload, and updateMask."
      ),
    reason: z
      .string()
      .optional()
      .describe("Reason for bulk update (audit trail)"),
  })
  .describe("Parameters for bulk updating DV360 entities");

/**
 * Output schema for bulk update entities tool
 */
export const BulkUpdateEntitiesOutputSchema = z
  .object({
    entityType: z.string().describe("Type of entities updated"),
    totalRequested: z.number().describe("Total items requested"),
    successCount: z.number().describe("Total items successfully updated"),
    failureCount: z.number().describe("Total items that failed"),
    results: z
      .array(
        BulkOperationResultSchema.extend({
          index: z.number().describe("Index of the item in the input array"),
          entityId: z.string().describe("Entity ID that was targeted"),
        })
      )
      .describe("Per-item results"),
    timestamp: z.string().datetime(),
  })
  .describe("Bulk update entities result");

type BulkUpdateEntitiesInput = z.infer<typeof BulkUpdateEntitiesInputSchema>;
type BulkUpdateEntitiesOutput = z.infer<typeof BulkUpdateEntitiesOutputSchema>;

/**
 * Bulk update entities tool logic
 */
export async function bulkUpdateEntitiesLogic(
  input: BulkUpdateEntitiesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkUpdateEntitiesOutput> {
  const { dv360Service } = resolveSessionServices(sdkContext);

  const results: BulkUpdateEntitiesOutput["results"] = [];
  let totalSucceeded = 0;
  let totalFailed = 0;

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];

    try {
      // Merge advertiserId and entity-specific ID into data
      const mergedData = mergeIdsIntoData(
        input.entityType,
        item.data as Record<string, unknown>,
        {
          advertiserId: input.advertiserId,
          [`${input.entityType}Id`]: item.entityId,
        } as Record<string, unknown>
      );

      // Build entityIds with advertiserId and the entity-specific ID
      const entityIds = extractEntityIds(
        {
          advertiserId: input.advertiserId,
          [`${input.entityType}Id`]: item.entityId,
        },
        input.entityType
      );

      const updated = await dv360Service.updateEntity(
        input.entityType,
        entityIds,
        mergedData,
        item.updateMask,
        context
      );

      results.push({
        index: i,
        entityId: item.entityId,
        success: true,
        entity: updated as Record<string, any>,
      });
      totalSucceeded++;
    } catch (error: any) {
      results.push({
        index: i,
        entityId: item.entityId,
        success: false,
        error: error.message || String(error),
      });
      totalFailed++;
    }
  }

  return {
    entityType: input.entityType,
    totalRequested: input.items.length,
    successCount: totalSucceeded,
    failureCount: totalFailed,
    results,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format response for MCP client
 */
export function bulkUpdateEntitiesResponseFormatter(
  result: BulkUpdateEntitiesOutput
): any {
  const summary = `Bulk update ${result.entityType}: ${result.successCount}/${result.totalRequested} succeeded, ${result.failureCount} failed`;

  const successResults = result.results.filter((r) => r.success);
  const failedResults = result.results.filter((r) => !r.success);

  let responseText = summary;

  if (successResults.length > 0) {
    responseText += `\n\nSuccessful updates:\n${JSON.stringify(successResults, null, 2)}`;
  }

  if (failedResults.length > 0) {
    responseText += `\n\nFailed updates:\n${JSON.stringify(failedResults, null, 2)}`;
  }

  responseText +=
    "\n\nNote: Each item's updateMask determines which fields are written. " +
    "Fields not in the updateMask are left unchanged.";

  responseText += `\n\nTimestamp: ${result.timestamp}`;

  return [
    {
      type: "text" as const,
      text: responseText,
    },
  ];
}

/**
 * Bulk Update Entities Tool Definition
 */
export const bulkUpdateEntitiesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BulkUpdateEntitiesInputSchema,
  outputSchema: BulkUpdateEntitiesOutputSchema,
  inputExamples: [
    {
      label: "Bulk update line item bids and budgets",
      input: {
        entityType: "lineItem",
        advertiserId: "1234567",
        items: [
          {
            entityId: "5678901",
            data: {
              bidStrategy: {
                fixedBid: { bidAmountMicros: "6000000" },
              },
            },
            updateMask: "bidStrategy.fixedBid.bidAmountMicros",
          },
          {
            entityId: "5678902",
            data: {
              bidStrategy: {
                fixedBid: { bidAmountMicros: "4000000" },
              },
            },
            updateMask: "bidStrategy.fixedBid.bidAmountMicros",
          },
        ],
        reason: "Bid optimization — adjusting CPMs based on pacing",
      },
    },
    {
      label: "Bulk rename insertion orders",
      input: {
        entityType: "insertionOrder",
        advertiserId: "1234567",
        items: [
          {
            entityId: "4445551",
            data: { displayName: "IO - Display Prospecting (Updated)" },
            updateMask: "displayName",
          },
          {
            entityId: "4445552",
            data: { displayName: "IO - Video Retargeting (Updated)" },
            updateMask: "displayName",
          },
        ],
        reason: "Naming convention update",
      },
    },
  ],
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  logic: bulkUpdateEntitiesLogic,
  responseFormatter: bulkUpdateEntitiesResponseFormatter,
};
