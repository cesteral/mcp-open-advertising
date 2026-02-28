import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum } from "../utils/entity-mapping.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "meta_bulk_update_status";
const TOOL_TITLE = "Bulk Update Meta Ads Entity Status";
const TOOL_DESCRIPTION = `Batch update status for multiple Meta Ads entities.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**Valid statuses:** ACTIVE, PAUSED, ARCHIVED

**Gotchas:**
- Can't ARCHIVE entities with active children.
- ARCHIVED is permanent and cannot be reversed.
- Max 50 entities per call.
- Each update consumes 3x rate limit tokens (write operation).`;

export const BulkUpdateStatusInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to update"),
    entityIds: z
      .array(z.string())
      .min(1)
      .max(50)
      .describe("Entity IDs to update (max 50)"),
    status: z
      .enum(["ACTIVE", "PAUSED", "ARCHIVED"])
      .describe("Target status"),
  })
  .describe("Parameters for bulk status update");

export const BulkUpdateStatusOutputSchema = z
  .object({
    results: z.array(z.object({
      entityId: z.string(),
      success: z.boolean(),
      error: z.string().optional(),
    })),
    successCount: z.number(),
    failureCount: z.number(),
    timestamp: z.string().datetime(),
  })
  .describe("Bulk status update result");

type BulkUpdateStatusInput = z.infer<typeof BulkUpdateStatusInputSchema>;
type BulkUpdateStatusOutput = z.infer<typeof BulkUpdateStatusOutputSchema>;

export async function bulkUpdateStatusLogic(
  input: BulkUpdateStatusInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkUpdateStatusOutput> {
  const { metaService } = resolveSessionServices(sdkContext);

  const result = await metaService.bulkUpdateStatus(
    input.entityIds,
    input.status,
    context
  );

  const successCount = result.results.filter((r) => r.success).length;

  return {
    results: result.results,
    successCount,
    failureCount: result.results.length - successCount,
    timestamp: new Date().toISOString(),
  };
}

export function bulkUpdateStatusResponseFormatter(result: BulkUpdateStatusOutput): unknown[] {
  return [
    {
      type: "text" as const,
      text: `Bulk status update: ${result.successCount} succeeded, ${result.failureCount} failed\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: true,
  },
  inputExamples: [
    {
      label: "Pause multiple campaigns",
      input: {
        entityType: "campaign",
        entityIds: ["23456789012345", "23456789012346"],
        status: "PAUSED",
      },
    },
  ],
  logic: bulkUpdateStatusLogic,
  responseFormatter: bulkUpdateStatusResponseFormatter,
};
