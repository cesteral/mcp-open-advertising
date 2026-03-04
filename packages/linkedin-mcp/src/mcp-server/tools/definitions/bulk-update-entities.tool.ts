import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type LinkedInEntityType } from "../utils/entity-mapping.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "linkedin_bulk_update_entities";
const TOOL_TITLE = "Bulk Update LinkedIn Ads Entities";
const TOOL_DESCRIPTION = `Batch update multiple LinkedIn Ads entities with arbitrary data.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Each item must include \`entityUrn\` and \`data\` to update.
Updates are applied individually with concurrency (max 5 concurrent).

**Gotchas:**
- Max 50 items per call.
- Partial failures are allowed — check results for individual errors.`;

export const BulkUpdateEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to update"),
    items: z
      .array(
        z.object({
          entityUrn: z.string().describe("Entity URN to update"),
          data: z.record(z.any()).describe("Fields to update"),
        })
      )
      .min(1)
      .max(50)
      .describe("Update items (max 50)"),
  })
  .describe("Parameters for bulk entity updates");

export const BulkUpdateEntitiesOutputSchema = z
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
  .describe("Bulk update result");

type BulkUpdateEntitiesInput = z.infer<typeof BulkUpdateEntitiesInputSchema>;
type BulkUpdateEntitiesOutput = z.infer<typeof BulkUpdateEntitiesOutputSchema>;

export async function bulkUpdateEntitiesLogic(
  input: BulkUpdateEntitiesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkUpdateEntitiesOutput> {
  const { linkedInService } = resolveSessionServices(sdkContext);

  const result = await linkedInService.bulkUpdateEntities(
    input.entityType as LinkedInEntityType,
    input.items,
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

export function bulkUpdateEntitiesResponseFormatter(
  result: BulkUpdateEntitiesOutput
): unknown[] {
  return [
    {
      type: "text" as const,
      text: `Bulk update: ${result.successCount} succeeded, ${result.failureCount} failed\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    idempotentHint: true,
    destructiveHint: true,
  },
  inputExamples: [
    {
      label: "Update daily budgets for multiple campaigns",
      input: {
        entityType: "campaign",
        items: [
          {
            entityUrn: "urn:li:sponsoredCampaign:111111111",
            data: { dailyBudget: { amount: "75.00", currencyCode: "USD" } },
          },
          {
            entityUrn: "urn:li:sponsoredCampaign:222222222",
            data: { dailyBudget: { amount: "100.00", currencyCode: "USD" } },
          },
        ],
      },
    },
  ],
  logic: bulkUpdateEntitiesLogic,
  responseFormatter: bulkUpdateEntitiesResponseFormatter,
};
