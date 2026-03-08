import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getStatusCapableEntityTypeEnum, type GAdsEntityType } from "../utils/entity-mapping.js";
import { addParentValidationIssue } from "../utils/parent-id-validation.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "gads_bulk_update_status";
const TOOL_TITLE = "Bulk Update Google Ads Entity Status";
const TOOL_DESCRIPTION = `Batch update the status for multiple Google Ads entities of the same type.

**Supported entity types:** ${getStatusCapableEntityTypeEnum().join(", ")}

**Available statuses:**
- \`ENABLED\` — active and eligible for delivery
- \`PAUSED\` — temporarily stopped (can be re-enabled)
- \`REMOVED\` — permanently removed (cannot be un-removed)

Use this tool for batch pause/resume operations across campaigns, ad groups, or ads.

**Composite entityId required for:** \`ad\` → use \`{adGroupId}~{adId}\`, \`keyword\` → use \`{adGroupId}~{criterionId}\`. Other entity types use simple IDs.`;

export const BulkUpdateStatusInputSchema = z
  .object({
    entityType: z
      .enum(getStatusCapableEntityTypeEnum())
      .describe("Type of entities to update (only types with a status field)"),
    customerId: z
      .string()
      .min(1)
      .describe("Google Ads customer ID (no dashes)"),
    entityIds: z
      .array(z.string().min(1))
      .min(1)
      .max(100)
      .describe("Array of entity IDs to update (max 100)"),
    status: z
      .enum(["ENABLED", "PAUSED", "REMOVED"])
      .describe("New entity status"),
  })
  .superRefine((input, ctx) => {
    addParentValidationIssue(
      ctx,
      input.entityType as GAdsEntityType,
      input as Record<string, unknown>,
      [],
      { validateCompositeIds: true }
    );
  })
  .describe("Parameters for bulk status update");

export const BulkUpdateStatusOutputSchema = z
  .object({
    entityType: z.string(),
    targetStatus: z.string(),
    totalRequested: z.number(),
    successCount: z.number(),
    failureCount: z.number(),
    results: z.array(
      z.object({
        entityId: z.string(),
        success: z.boolean(),
        error: z.string().optional(),
      })
    ),
    timestamp: z.string().datetime(),
  })
  .describe("Bulk status update result");

type BulkStatusInput = z.infer<typeof BulkUpdateStatusInputSchema>;
type BulkStatusOutput = z.infer<typeof BulkUpdateStatusOutputSchema>;

export async function bulkUpdateStatusLogic(
  input: BulkStatusInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkStatusOutput> {
  const { gadsService } = resolveSessionServices(sdkContext);

  const { results } = await gadsService.bulkUpdateStatus(
    input.entityType as GAdsEntityType,
    input.customerId,
    input.entityIds,
    input.status as "ENABLED" | "PAUSED" | "REMOVED",
    context
  );

  const succeeded = results.filter((r) => r.success).length;

  return {
    entityType: input.entityType,
    targetStatus: input.status,
    totalRequested: input.entityIds.length,
    successCount: succeeded,
    failureCount: input.entityIds.length - succeeded,
    results,
    timestamp: new Date().toISOString(),
  };
}

export function bulkUpdateStatusResponseFormatter(result: BulkStatusOutput): any {
  return [
    {
      type: "text" as const,
      text: `Bulk status update → ${result.targetStatus} for ${result.entityType}: ${result.successCount}/${result.totalRequested} succeeded, ${result.failureCount} failed\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const bulkUpdateStatusTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BulkUpdateStatusInputSchema,
  outputSchema: BulkUpdateStatusOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Pause a single campaign",
      input: {
        entityType: "campaign",
        customerId: "1234567890",
        entityIds: ["9876543210"],
        status: "PAUSED",
      },
    },
    {
      label: "Pause multiple ad groups",
      input: {
        entityType: "adGroup",
        customerId: "1234567890",
        entityIds: ["1111111111", "2222222222", "3333333333"],
        status: "PAUSED",
      },
    },
    {
      label: "Re-enable paused ads",
      input: {
        entityType: "ad",
        customerId: "1234567890",
        entityIds: ["5555555555~7777777777", "5555555555~8888888888"],
        status: "ENABLED",
      },
    },
  ],
  logic: bulkUpdateStatusLogic,
  responseFormatter: bulkUpdateStatusResponseFormatter,
};
