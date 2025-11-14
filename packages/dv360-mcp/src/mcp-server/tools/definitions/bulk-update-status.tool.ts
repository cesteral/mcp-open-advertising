import { z } from "zod";
import { container } from "tsyringe";
import { DV360Service } from "../../../services/dv360/DV360Service.js";
import type { RequestContext } from "../../../utils/internal/requestContext.js";

const TOOL_NAME = "dv360_bulk_update_status";
const TOOL_TITLE = "Bulk Update Entity Status";
const TOOL_DESCRIPTION =
  "Batch update entity status (active/paused) for multiple entities in a single operation (Tier 2 workflow tool)";

/**
 * Input schema for bulk update status tool
 */
export const BulkUpdateStatusInputSchema = z
  .object({
    entityType: z
      .enum(["campaign", "insertionOrder", "lineItem", "adGroup"])
      .describe("Type of entities to update"),
    advertiserId: z.string().describe("Advertiser ID"),
    entityIds: z
      .array(z.string())
      .min(1)
      .max(50)
      .describe("List of entity IDs to update (max 50)"),
    status: z
      .enum([
        "ENTITY_STATUS_ACTIVE",
        "ENTITY_STATUS_PAUSED",
        "ENTITY_STATUS_ARCHIVED",
        "ENTITY_STATUS_DRAFT",
      ])
      .describe("Target entity status"),
    reason: z.string().optional().describe("Reason for status change (audit trail)"),
  })
  .describe("Parameters for bulk status update");

/**
 * Output schema for bulk update status tool
 */
export const BulkUpdateStatusOutputSchema = z
  .object({
    successful: z
      .array(
        z.object({
          entityId: z.string(),
          previousStatus: z.string(),
          newStatus: z.string(),
        })
      )
      .describe("Successfully updated entities"),
    failed: z
      .array(
        z.object({
          entityId: z.string(),
          error: z.string(),
        })
      )
      .describe("Failed updates with error messages"),
    totalRequested: z.number().describe("Total updates requested"),
    totalSuccessful: z.number().describe("Total successful updates"),
    totalFailed: z.number().describe("Total failed updates"),
    timestamp: z.string().datetime(),
  })
  .describe("Bulk status update result");

type BulkUpdateStatusInput = z.infer<typeof BulkUpdateStatusInputSchema>;
type BulkUpdateStatusOutput = z.infer<typeof BulkUpdateStatusOutputSchema>;

/**
 * Bulk update status tool logic
 */
export async function bulkUpdateStatusLogic(
  input: BulkUpdateStatusInput,
  context: RequestContext
): Promise<BulkUpdateStatusOutput> {
  const dv360Service = container.resolve(DV360Service);

  const successful: Array<{
    entityId: string;
    previousStatus: string;
    newStatus: string;
  }> = [];
  const failed: Array<{ entityId: string; error: string }> = [];

  // Process each entity
  for (const entityId of input.entityIds) {
    try {
      const entityIds: Record<string, string> = {
        advertiserId: input.advertiserId,
        [`${input.entityType}Id`]: entityId,
      };

      // Get current entity to extract previous status
      const currentEntity = (await dv360Service.getEntity(
        input.entityType,
        entityIds,
        context
      )) as any;

      const previousStatus = currentEntity.entityStatus || "ENTITY_STATUS_UNSPECIFIED";

      // Skip if already in target status
      if (previousStatus === input.status) {
        successful.push({
          entityId,
          previousStatus,
          newStatus: input.status,
        });
        continue;
      }

      // Update status
      await dv360Service.updateEntity(
        input.entityType,
        entityIds,
        {
          entityStatus: input.status,
        },
        "entityStatus",
        context
      );

      successful.push({
        entityId,
        previousStatus,
        newStatus: input.status,
      });
    } catch (error: any) {
      failed.push({
        entityId,
        error: error.message || String(error),
      });
    }
  }

  return {
    successful,
    failed,
    totalRequested: input.entityIds.length,
    totalSuccessful: successful.length,
    totalFailed: failed.length,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format response for MCP client
 */
export function bulkUpdateStatusResponseFormatter(result: BulkUpdateStatusOutput): any {
  const summary = `Bulk status update completed: ${result.totalSuccessful}/${result.totalRequested} successful`;
  const successList =
    result.successful.length > 0
      ? `\n\nSuccessful updates:\n${JSON.stringify(result.successful, null, 2)}`
      : "";
  const failedList =
    result.failed.length > 0
      ? `\n\nFailed updates:\n${JSON.stringify(result.failed, null, 2)}`
      : "";

  return [
    {
      type: "text" as const,
      text: `${summary}${successList}${failedList}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

/**
 * Bulk Update Status Tool Definition
 */
export const bulkUpdateStatusTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BulkUpdateStatusInputSchema,
  outputSchema: BulkUpdateStatusOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: false,
  },
  logic: bulkUpdateStatusLogic,
  responseFormatter: bulkUpdateStatusResponseFormatter,
};
