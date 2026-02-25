import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type TtdEntityType } from "../utils/entity-mapping.js";
import type { RequestContext } from "../../../utils/internal/request-context.js";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "ttd_bulk_update_status";
const TOOL_TITLE = "Bulk Update TTD Entity Status";
const TOOL_DESCRIPTION = `Batch update the availability status for multiple The Trade Desk entities of the same type.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**Available statuses:**
- \`Available\` — active and eligible for delivery
- \`Paused\` — temporarily stopped (can be resumed)
- \`Archived\` — permanently deactivated (cannot be un-archived)

Use this tool for batch pause/resume operations across campaigns or ad groups.`;

export const BulkUpdateStatusInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to update"),
    entityIds: z
      .array(z.string().min(1))
      .min(1)
      .max(100)
      .describe("Array of entity IDs to update (max 100)"),
    status: z
      .enum(["Available", "Paused", "Archived"])
      .describe("New availability status"),
  })
  .describe("Parameters for bulk status update");

export const BulkUpdateStatusOutputSchema = z
  .object({
    entityType: z.string(),
    targetStatus: z.string(),
    totalRequested: z.number(),
    totalSucceeded: z.number(),
    totalFailed: z.number(),
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
  const { ttdService } = resolveSessionServices(sdkContext);

  const { results } = await ttdService.bulkUpdateStatus(
    input.entityType as TtdEntityType,
    input.entityIds,
    input.status as "Available" | "Paused" | "Archived",
    context
  );

  const succeeded = results.filter((r) => r.success).length;

  return {
    entityType: input.entityType,
    targetStatus: input.status,
    totalRequested: input.entityIds.length,
    totalSucceeded: succeeded,
    totalFailed: input.entityIds.length - succeeded,
    results,
    timestamp: new Date().toISOString(),
  };
}

export function bulkUpdateStatusResponseFormatter(result: BulkStatusOutput): any {
  return [
    {
      type: "text" as const,
      text: `Bulk status update → ${result.targetStatus} for ${result.entityType}: ${result.totalSucceeded}/${result.totalRequested} succeeded, ${result.totalFailed} failed\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Pause multiple ad groups",
      input: {
        entityType: "adGroup",
        entityIds: ["adg111aaa", "adg222bbb", "adg333ccc"],
        status: "Paused",
      },
    },
    {
      label: "Resume (activate) multiple campaigns",
      input: {
        entityType: "campaign",
        entityIds: ["camp456def", "camp789ghi"],
        status: "Available",
      },
    },
    {
      label: "Archive a set of creatives",
      input: {
        entityType: "creative",
        entityIds: ["cre001xyz", "cre002xyz"],
        status: "Archived",
      },
    },
  ],
  logic: bulkUpdateStatusLogic,
  responseFormatter: bulkUpdateStatusResponseFormatter,
};
