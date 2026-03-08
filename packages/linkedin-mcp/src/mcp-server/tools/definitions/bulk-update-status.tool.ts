import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type LinkedInEntityType } from "../utils/entity-mapping.js";
import type { RequestContext } from "@cesteral/shared";
import { elicitArchiveConfirmation } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "linkedin_bulk_update_status";
const TOOL_TITLE = "Bulk Update LinkedIn Ads Entity Status";
const TOOL_DESCRIPTION = `Batch update status for multiple LinkedIn Ads entities.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**Valid statuses:** ACTIVE, PAUSED, DRAFT, ARCHIVED, CANCELED

**Gotchas:**
- ARCHIVED entities cannot be reactivated.
- Campaign groups must be paused before archiving.
- Max 50 entities per call.
- Each update consumes 3x rate limit tokens (write operation).`;

export const BulkUpdateStatusInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to update"),
    entityUrns: z
      .array(z.string())
      .min(1)
      .max(50)
      .describe("Entity URNs to update (max 50)"),
    status: z
      .enum(["ACTIVE", "PAUSED", "DRAFT", "ARCHIVED", "CANCELED"])
      .describe("Target status"),
  })
  .describe("Parameters for bulk status update");

export const BulkUpdateStatusOutputSchema = z
  .object({
    results: z.array(z.object({
      entityUrn: z.string(),
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
  // Elicit confirmation for irreversible archive operations
  if (input.status === "ARCHIVED") {
    const confirmed = await elicitArchiveConfirmation(input.entityUrns.length, input.entityType, sdkContext);
    if (!confirmed) {
      return { results: [], successCount: 0, failureCount: 0, timestamp: new Date().toISOString() };
    }
  }

  const { linkedInService } = resolveSessionServices(sdkContext);

  const result = await linkedInService.bulkUpdateStatus(
    input.entityType as LinkedInEntityType,
    input.entityUrns,
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
        entityUrns: [
          "urn:li:sponsoredCampaign:111111111",
          "urn:li:sponsoredCampaign:222222222",
        ],
        status: "PAUSED",
      },
    },
  ],
  logic: bulkUpdateStatusLogic,
  responseFormatter: bulkUpdateStatusResponseFormatter,
};
