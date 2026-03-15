// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type MsAdsEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_bulk_update_entities";
const TOOL_TITLE = "Bulk Update Microsoft Ads Entities";
const TOOL_DESCRIPTION = `Batch update multiple Microsoft Advertising entities.

Each item must include the Id field. Only include fields you want to change.`;

export const BulkUpdateEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to update"),
    items: z
      .array(z.record(z.unknown()))
      .min(1)
      .describe("Array of entity data objects with Id and fields to update"),
  })
  .describe("Parameters for bulk updating Microsoft Ads entities");

export const BulkUpdateEntitiesOutputSchema = z
  .object({
    results: z.array(z.record(z.any())),
    entityType: z.string(),
    totalItems: z.number(),
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
  const { msadsService } = resolveSessionServices(sdkContext);

  const results = await msadsService.bulkUpdateEntities(
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

export function bulkUpdateEntitiesResponseFormatter(result: BulkUpdateEntitiesOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Bulk updated ${result.totalItems} ${result.entityType} entities\n\nResults:\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Bulk update campaign budgets",
      input: {
        entityType: "campaign",
        items: [
          { Id: 123, DailyBudget: 100.0 },
          { Id: 456, DailyBudget: 200.0 },
        ],
      },
    },
  ],
  logic: bulkUpdateEntitiesLogic,
  responseFormatter: bulkUpdateEntitiesResponseFormatter,
};