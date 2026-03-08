import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityExamplesByCategory } from "../utils/entity-examples.js";
import { addIdValidationIssues } from "../utils/parent-id-validation.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "dv360_bulk_update_status";
const TOOL_TITLE = "Bulk Update Entity Status";

// Generate dynamic description with status examples
function generateStatusToolDescription(): string {
  const statusExamples = getEntityExamplesByCategory("lineItem", "status");

  let description = `Batch update entity status (active/paused) for multiple entities in a single operation (Tier 2 workflow tool).

**Important Notes:**
- Valid statuses: ENTITY_STATUS_ACTIVE, ENTITY_STATUS_PAUSED, ENTITY_STATUS_ARCHIVED, ENTITY_STATUS_DRAFT
- Cannot unarchive once archived (status change is irreversible)
- Pausing a parent entity (campaign, IO) pauses all children

**Common Status Operations:**`;

  statusExamples.forEach((ex) => {
    description += `\n- ${ex.operation}: ${ex.notes}`;
  });

  return description;
}

const TOOL_DESCRIPTION = generateStatusToolDescription();

/**
 * Input schema for bulk update status tool
 */
export const BulkUpdateStatusInputSchema = z
  .object({
    entityType: z
      .enum(["campaign", "insertionOrder", "lineItem", "adGroup"])
      .describe("Type of entities to update"),
    advertiserId: z
      .string()
      .min(1)
      .describe("Advertiser ID (required for campaign, insertionOrder, lineItem, adGroup)"),
    entityIds: z.array(z.string()).min(1).max(50).describe("List of entity IDs to update (max 50)"),
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
  .superRefine((input, ctx) => {
    addIdValidationIssues(ctx, {
      entityType: input.entityType,
      input: input as Record<string, unknown>,
      operation: "update",
      requireEntityId: false,
      path: ["advertiserId"],
    });
  })
  .describe("Parameters for bulk status update");

/**
 * Output schema for bulk update status tool
 */
export const BulkUpdateStatusOutputSchema = z
  .object({
    results: z
      .array(
        z.object({
          entityId: z.string(),
          success: z.boolean(),
          error: z.string().optional(),
          advertiserId: z.string().optional(),
          entityType: z.string().optional(),
          entityName: z.string().optional(),
          previousStatus: z.string().optional(),
          newStatus: z.string().optional(),
          statusChanged: z.boolean().optional(),
        })
      )
      .describe("Canonical per-item result array"),
    successful: z
      .array(
        z.object({
          advertiserId: z.string(),
          entityType: z.string(),
          entityId: z.string(),
          entityName: z.string().optional(),
          previousStatus: z.string(),
          newStatus: z.string(),
          statusChanged: z.boolean().describe("Indicates whether an update was required"),
        })
      )
      .describe("Successfully updated entities"),
    failed: z
      .array(
        z.object({
          advertiserId: z.string(),
          entityType: z.string(),
          entityId: z.string(),
          entityName: z.string().optional(),
          error: z.string(),
        })
      )
      .describe("Failed updates with error messages"),
    totalRequested: z.number().describe("Total updates requested"),
    totalSuccessful: z.number().describe("Total successful updates"),
    totalFailed: z.number().describe("Total failed updates"),
    successCount: z.number().describe("Alias for totalSuccessful"),
    failureCount: z.number().describe("Alias for totalFailed"),
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
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkUpdateStatusOutput> {
  // Elicit confirmation for irreversible archive operations
  if (input.status === "ENTITY_STATUS_ARCHIVED" && sdkContext?.elicitInput) {
    const elicitResult = await sdkContext.elicitInput({
      message: `You are about to archive ${input.entityIds.length} ${input.entityType}(s). This action is irreversible — archived entities cannot be reactivated. Proceed?`,
      requestedSchema: {
        type: "object" as const,
        properties: {
          confirm: {
            type: "boolean" as const,
            title: "Confirm archive",
            description: `Archive ${input.entityIds.length} ${input.entityType}(s) permanently`,
            default: false,
          },
        },
      },
    });

    if (elicitResult.action !== "accept" || !elicitResult.content?.confirm) {
      return {
        results: [],
        successful: [],
        failed: [],
        totalRequested: input.entityIds.length,
        totalSuccessful: 0,
        totalFailed: 0,
        successCount: 0,
        failureCount: 0,
        timestamp: new Date().toISOString(),
      };
    }
  }

  const { dv360Service } = resolveSessionServices(sdkContext);
  const advertiserId = input.advertiserId;

  const successful: Array<{
    advertiserId: string;
    entityType: string;
    entityId: string;
    entityName?: string;
    previousStatus: string;
    newStatus: string;
    statusChanged: boolean;
  }> = [];
  const failed: Array<{
    advertiserId: string;
    entityType: string;
    entityId: string;
    entityName?: string;
    error: string;
  }> = [];

  // Process each entity
  for (const entityId of input.entityIds) {
    let entityName: string | undefined;
    try {
      const entityIds: Record<string, string> = {
        advertiserId,
        [`${input.entityType}Id`]: entityId,
      };

      // Get current entity to extract previous status
      const currentEntity = (await dv360Service.getEntity(
        input.entityType,
        entityIds,
        context
      )) as any;

      entityName =
        (currentEntity.displayName as string | undefined) ||
        (currentEntity.name as string | undefined);

      const previousStatus = currentEntity.entityStatus || "ENTITY_STATUS_UNSPECIFIED";

      // Skip if already in target status
      if (previousStatus === input.status) {
        successful.push({
          advertiserId,
          entityType: input.entityType,
          entityId,
          entityName,
          previousStatus,
          newStatus: input.status,
          statusChanged: false,
        });
        continue;
      }

      // Update status — pass currentEntity to avoid redundant GET inside updateEntity
      await dv360Service.updateEntity(
        input.entityType,
        entityIds,
        {
          entityStatus: input.status,
        },
        "entityStatus",
        context,
        currentEntity as Record<string, unknown>
      );

      successful.push({
        advertiserId,
        entityType: input.entityType,
        entityId,
        entityName,
        previousStatus,
        newStatus: input.status,
        statusChanged: true,
      });
    } catch (error: any) {
      failed.push({
        advertiserId,
        entityType: input.entityType,
        entityId,
        entityName,
        error: error.message || String(error),
      });
    }
  }

  return {
    results: [
      ...successful.map((item) => ({
        entityId: item.entityId,
        success: true,
        advertiserId: item.advertiserId,
        entityType: item.entityType,
        entityName: item.entityName,
        previousStatus: item.previousStatus,
        newStatus: item.newStatus,
        statusChanged: item.statusChanged,
      })),
      ...failed.map((item) => ({
        entityId: item.entityId,
        success: false,
        error: item.error,
        advertiserId: item.advertiserId,
        entityType: item.entityType,
        entityName: item.entityName,
      })),
    ],
    successful,
    failed,
    totalRequested: input.entityIds.length,
    totalSuccessful: successful.length,
    totalFailed: failed.length,
    successCount: successful.length,
    failureCount: failed.length,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format response for MCP client
 */
export function bulkUpdateStatusResponseFormatter(
  result: BulkUpdateStatusOutput,
  input?: BulkUpdateStatusInput
): any {
  const summary = `Bulk status update completed: ${result.totalSuccessful}/${result.totalRequested} successful`;
  const successList =
    result.successful.length > 0
      ? `\n\nSuccessful updates:\n${JSON.stringify(result.successful, null, 2)}`
      : "";
  const failedList =
    result.failed.length > 0
      ? `\n\nFailed updates:\n${JSON.stringify(result.failed, null, 2)}`
      : "";

  // Add helpful note based on status
  let note = "";
  if (input?.status === "ENTITY_STATUS_ARCHIVED") {
    note = `\n\n⚠️  Warning: Archived entities cannot be reactivated. This change is irreversible.`;
  } else if (input?.status === "ENTITY_STATUS_PAUSED") {
    note = `\n\n💡 Note: Paused entities can be reactivated later by setting status to ENTITY_STATUS_ACTIVE.`;
  }

  return [
    {
      type: "text" as const,
      text: `${summary}${successList}${failedList}${note}\n\nTimestamp: ${result.timestamp}`,
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
  inputExamples: [
    {
      label: "Pause multiple line items",
      input: {
        entityType: "lineItem",
        advertiserId: "1234567",
        entityIds: ["5678901", "5678902", "5678903"],
        status: "ENTITY_STATUS_PAUSED",
        reason: "Budget review — pausing underperforming line items",
      },
    },
    {
      label: "Activate insertion orders",
      input: {
        entityType: "insertionOrder",
        advertiserId: "1234567",
        entityIds: ["4445551", "4445552"],
        status: "ENTITY_STATUS_ACTIVE",
        reason: "Campaign launch — activating approved IOs",
      },
    },
    {
      label: "Archive a campaign",
      input: {
        entityType: "campaign",
        advertiserId: "1234567",
        entityIds: ["9876543"],
        status: "ENTITY_STATUS_ARCHIVED",
        reason: "End of flight — archiving completed campaign",
      },
    },
  ],
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
    idempotentHint: true,
  },
  logic: bulkUpdateStatusLogic,
  responseFormatter: bulkUpdateStatusResponseFormatter,
};
