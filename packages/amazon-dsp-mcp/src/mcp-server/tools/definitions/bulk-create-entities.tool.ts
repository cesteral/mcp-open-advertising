// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type AmazonDspEntityType } from "../utils/entity-mapping.js";
import { BulkOperationResultSchema } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "amazon_dsp_bulk_create_entities";
const TOOL_TITLE = "AmazonDsp Bulk Create Entities";
const TOOL_DESCRIPTION = `Batch create multiple AmazonDsp Ads entities of the same type.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Creates entities sequentially (with concurrency). Each item follows the same
schema as \`amazon_dsp_create_entity\`.

Max 50 items per call. profile_id is automatically injected per item.`;

export const BulkCreateEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to create"),
    profileId: z
      .string()
      .min(1)
      .describe("AmazonDsp Advertiser ID"),
    items: z
      .array(z.record(z.any()))
      .min(1)
      .max(50)
      .describe("Array of entity data objects to create (max 50)"),
  })
  .describe("Parameters for bulk entity creation");

export const BulkCreateEntitiesOutputSchema = z
  .object({
    totalRequested: z.number(),
    successCount: z.number(),
    failureCount: z.number(),
    results: z.array(
      BulkOperationResultSchema.extend({
        index: z.number(),
      })
    ),
    timestamp: z.string().datetime(),
  })
  .describe("Bulk create result");

type BulkCreateEntitiesInput = z.infer<typeof BulkCreateEntitiesInputSchema>;
type BulkCreateEntitiesOutput = z.infer<typeof BulkCreateEntitiesOutputSchema>;

export async function bulkCreateEntitiesLogic(
  input: BulkCreateEntitiesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkCreateEntitiesOutput> {
  const { amazonDspService } = resolveSessionServices(sdkContext);

  const bulkResult = await amazonDspService.bulkCreateEntities(
    input.entityType as AmazonDspEntityType,
    input.items,
    context
  );

  const results = bulkResult.results.map((r, i) => ({
    index: i,
    success: r.success,
    entity: r.entity as Record<string, unknown> | undefined,
    error: r.error,
  }));

  const totalSucceeded = results.filter((r) => r.success).length;

  return {
    totalRequested: input.items.length,
    successCount: totalSucceeded,
    failureCount: input.items.length - totalSucceeded,
    results,
    timestamp: new Date().toISOString(),
  };
}

export function bulkCreateEntitiesResponseFormatter(result: BulkCreateEntitiesOutput): McpTextContent[] {
  const lines: string[] = [
    `Bulk create: ${result.successCount}/${result.totalRequested} succeeded, ${result.failureCount} failed`,
    "",
  ];

  for (const r of result.results) {
    if (r.success) {
      lines.push(`  [${r.index}]: SUCCESS - ${JSON.stringify(r.entity)}`);
    } else {
      lines.push(`  [${r.index}]: FAILED - ${r.error}`);
    }
  }

  lines.push("", `Timestamp: ${result.timestamp}`);

  return [{ type: "text" as const, text: lines.join("\n") }];
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
      label: "Bulk create orders (campaigns)",
      input: {
        entityType: "order",
        profileId: "1234567890",
        items: [
          {
            name: "Order A",
            advertiserId: "adv_123",
            budget: 10000,
            startDate: "2026-07-01",
            endDate: "2026-07-31",
          },
          {
            name: "Order B",
            advertiserId: "adv_123",
            budget: 20000,
            startDate: "2026-08-01",
            endDate: "2026-08-31",
          },
        ],
      },
    },
  ],
  logic: bulkCreateEntitiesLogic,
  responseFormatter: bulkCreateEntitiesResponseFormatter,
};