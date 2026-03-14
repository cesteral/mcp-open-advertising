import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type MsAdsEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_bulk_create_entities";
const TOOL_TITLE = "Bulk Create Microsoft Ads Entities";
const TOOL_DESCRIPTION = `Batch create multiple Microsoft Advertising entities in a single operation.

Items are automatically batched per entity type limits. Each batch is sent as a separate API call.`;

export const BulkCreateEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to create"),
    items: z
      .array(z.record(z.unknown()))
      .min(1)
      .describe("Array of entity data objects to create"),
  })
  .describe("Parameters for bulk creating Microsoft Ads entities");

export const BulkCreateEntitiesOutputSchema = z
  .object({
    results: z.array(z.record(z.any())),
    entityType: z.string(),
    totalItems: z.number(),
    timestamp: z.string().datetime(),
  })
  .describe("Bulk creation result");

type BulkCreateEntitiesInput = z.infer<typeof BulkCreateEntitiesInputSchema>;
type BulkCreateEntitiesOutput = z.infer<typeof BulkCreateEntitiesOutputSchema>;

export async function bulkCreateEntitiesLogic(
  input: BulkCreateEntitiesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkCreateEntitiesOutput> {
  const { msadsService } = resolveSessionServices(sdkContext);

  const results = await msadsService.bulkCreateEntities(
    input.entityType as MsAdsEntityType,
    input.items,
    context
  );

  return {
    results: results as Record<string, unknown>[],
    entityType: input.entityType,
    totalItems: input.items.length,
    timestamp: new Date().toISOString(),
  };
}

export function bulkCreateEntitiesResponseFormatter(result: BulkCreateEntitiesOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Bulk created ${result.totalItems} ${result.entityType} entities\n\nResults:\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const bulkCreateEntitiesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BulkCreateEntitiesInputSchema,
  outputSchema: BulkCreateEntitiesOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Bulk create ad groups",
      input: {
        entityType: "adGroup",
        items: [
          { Name: "Ad Group 1", CampaignId: 123 },
          { Name: "Ad Group 2", CampaignId: 123 },
        ],
      },
    },
  ],
  logic: bulkCreateEntitiesLogic,
  responseFormatter: bulkCreateEntitiesResponseFormatter,
};
