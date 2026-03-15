// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type MetaEntityType } from "../utils/entity-mapping.js";
import { BulkOperationResultSchema } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "meta_bulk_create_entities";
const TOOL_TITLE = "Bulk Create Meta Ads Entities";
const TOOL_DESCRIPTION = `Batch create multiple entities of the same type.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**Gotchas:**
- Max 50 items per call.
- Each creation consumes 3x rate limit tokens.
- Per-item failure reporting (partial success possible).
- Items are executed with concurrency limit of 5.`;

export const BulkCreateEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to create"),
    adAccountId: z
      .string()
      .describe("Ad Account ID"),
    items: z
      .array(z.record(z.any()))
      .min(1)
      .max(50)
      .describe("Array of entity data objects (max 50)"),
  })
  .describe("Parameters for bulk entity creation");

export const BulkCreateEntitiesOutputSchema = z
  .object({
    results: z.array(BulkOperationResultSchema),
    successCount: z.number(),
    failureCount: z.number(),
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
  const { metaService } = resolveSessionServices(sdkContext);

  const result = await metaService.bulkCreateEntities(
    input.entityType as MetaEntityType,
    input.adAccountId,
    input.items,
    context
  );

  const successCount = result.results.filter((r) => r.success).length;

  return {
    results: result.results as BulkCreateEntitiesOutput["results"],
    successCount,
    failureCount: result.results.length - successCount,
    timestamp: new Date().toISOString(),
  };
}

export function bulkCreateEntitiesResponseFormatter(result: BulkCreateEntitiesOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Bulk create: ${result.successCount} succeeded, ${result.failureCount} failed\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: true,
  },
  inputExamples: [
    {
      label: "Create multiple ad sets for a campaign",
      input: {
        entityType: "adSet",
        adAccountId: "act_123456789",
        items: [
          {
            name: "US 25-34 Males",
            campaign_id: "23456789012345",
            optimization_goal: "LINK_CLICKS",
            billing_event: "IMPRESSIONS",
            daily_budget: 5000,
            targeting: { age_min: 25, age_max: 34, genders: [1], geo_locations: { countries: ["US"] } },
            status: "PAUSED",
          },
          {
            name: "US 25-34 Females",
            campaign_id: "23456789012345",
            optimization_goal: "LINK_CLICKS",
            billing_event: "IMPRESSIONS",
            daily_budget: 5000,
            targeting: { age_min: 25, age_max: 34, genders: [2], geo_locations: { countries: ["US"] } },
            status: "PAUSED",
          },
        ],
      },
    },
  ],
  logic: bulkCreateEntitiesLogic,
  responseFormatter: bulkCreateEntitiesResponseFormatter,
};