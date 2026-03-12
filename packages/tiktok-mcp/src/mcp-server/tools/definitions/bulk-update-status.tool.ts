import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type TikTokEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import { elicitArchiveConfirmation } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "tiktok_bulk_update_status";
const TOOL_TITLE = "TikTok Bulk Status Update";
const TOOL_DESCRIPTION = `Batch update the status of TikTok Ads entities.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**Operation status values:**
- **ENABLE** — Activate entities
- **DISABLE** — Pause entities
- **DELETE** — Delete entities (irreversible)

TikTok's status update API accepts an array of IDs in a single request.`;

export const BulkUpdateStatusInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to update"),
    advertiserId: z
      .string()
      .min(1)
      .describe("TikTok Advertiser ID"),
    entityIds: z
      .array(z.string().min(1))
      .min(1)
      .max(20)
      .describe("Array of entity IDs to update (max 20)"),
    operationStatus: z
      .enum(["ENABLE", "DISABLE", "DELETE"])
      .describe("Target status to apply"),
  })
  .describe("Parameters for bulk status update of TikTok Ads entities");

export const BulkUpdateStatusOutputSchema = z
  .object({
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

type BulkUpdateStatusInput = z.infer<typeof BulkUpdateStatusInputSchema>;
type BulkUpdateStatusOutput = z.infer<typeof BulkUpdateStatusOutputSchema>;

export async function bulkUpdateStatusLogic(
  input: BulkUpdateStatusInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkUpdateStatusOutput> {
  // Elicit confirmation for irreversible DELETE operations
  if (input.operationStatus === "DELETE") {
    const confirmed = await elicitArchiveConfirmation(input.entityIds.length, input.entityType, sdkContext);
    if (!confirmed) {
      return { totalRequested: 0, successCount: 0, failureCount: 0, results: [], timestamp: new Date().toISOString() };
    }
  }

  const { tiktokService } = resolveSessionServices(sdkContext);

  const result = await tiktokService.bulkUpdateStatus(
    input.entityType as TikTokEntityType,
    input.entityIds,
    input.operationStatus,
    context
  );

  const successCount = result.results.filter((r) => r.success).length;

  return {
    totalRequested: input.entityIds.length,
    successCount,
    failureCount: input.entityIds.length - successCount,
    results: result.results,
    timestamp: new Date().toISOString(),
  };
}

export function bulkUpdateStatusResponseFormatter(result: BulkUpdateStatusOutput): McpTextContent[] {
  const lines: string[] = [
    `Status updates: ${result.successCount}/${result.totalRequested} succeeded, ${result.failureCount} failed`,
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
        advertiserId: "1234567890",
        entityIds: ["1800111111111", "1800222222222"],
        operationStatus: "DISABLE",
      },
    },
    {
      label: "Enable multiple ad groups",
      input: {
        entityType: "adGroup",
        advertiserId: "1234567890",
        entityIds: ["1700111111111"],
        operationStatus: "ENABLE",
      },
    },
  ],
  logic: bulkUpdateStatusLogic,
  responseFormatter: bulkUpdateStatusResponseFormatter,
};
