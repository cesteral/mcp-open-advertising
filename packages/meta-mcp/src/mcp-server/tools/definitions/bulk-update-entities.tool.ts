// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum } from "../utils/entity-mapping.js";
import {
  BulkOperationResultSchema,
  elicitBulkMutationConfirmation,
  hasSensitiveBulkField,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "meta_bulk_update_entities";
const TOOL_TITLE = "Bulk Update Meta Ads Entities";
const TOOL_DESCRIPTION = `Batch update multiple entities with individual data payloads.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**Gotchas:**
- Max 50 items per call.
- Each update consumes 3x rate limit tokens.
- Per-item failure reporting (partial success possible).
- Items are executed with concurrency limit of 5.
- entityType is informational only (not used in API call).`;

export const BulkUpdateEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .optional()
      .describe("Type of entities being updated (informational only)"),
    items: z
      .array(
        z.object({
          entityId: z.string().describe("Entity ID to update"),
          data: z.record(z.any()).describe("Fields to update"),
        })
      )
      .min(1)
      .max(50)
      .describe("Array of update items, each with entityId and data (max 50)"),
  })
  .describe("Parameters for bulk entity updates");

export const BulkUpdateEntitiesOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    results: z.array(
      BulkOperationResultSchema.extend({
        entityId: z.string(),
      })
    ),
    successCount: z.number(),
    failureCount: z.number(),
    timestamp: z.string().datetime(),
  })
  .describe("Bulk update result");

type BulkUpdateEntitiesInput = z.infer<typeof BulkUpdateEntitiesInputSchema>;
type BulkUpdateEntitiesOutput = z.infer<typeof BulkUpdateEntitiesOutputSchema>;

export async function bulkUpdateEntitiesLogic(
  input: BulkUpdateEntitiesInput,
  _context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkUpdateEntitiesOutput> {
  const payloads = input.items.map((it) => it.data ?? {});
  const confirmed = await elicitBulkMutationConfirmation({
    count: input.items.length,
    entityLabel: input.entityType ?? "entity",
    summary: "Applying field updates across multiple Meta Ads entities.",
    hasSensitiveFieldChange: hasSensitiveBulkField(payloads),
    impactPreview: input.items.map((it) => it.entityId),
    sdkContext,
  });
  if (!confirmed) {
    return {
      confirmed: false,
      declineReason: "user_declined",
      results: [],
      successCount: 0,
      failureCount: 0,
      timestamp: new Date().toISOString(),
    };
  }

  const { metaService } = resolveSessionServices(sdkContext);

  const result = await metaService.bulkUpdateEntities(input.items, _context);

  const successCount = result.results.filter((r) => r.success).length;

  return {
    confirmed: true,
    results: result.results,
    successCount,
    failureCount: result.results.length - successCount,
    timestamp: new Date().toISOString(),
  };
}

export function bulkUpdateEntitiesResponseFormatter(
  result: BulkUpdateEntitiesOutput
): McpTextContent[] {
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Bulk update cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
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
    idempotentHint: false,
    destructiveHint: true,
  },
  inputExamples: [
    {
      label: "Update budgets for multiple ad sets",
      input: {
        entityType: "adSet",
        items: [
          {
            entityId: "23456789012345",
            data: { daily_budget: 7500 },
          },
          {
            entityId: "23456789012346",
            data: { daily_budget: 5000 },
          },
        ],
      },
    },
  ],
  logic: bulkUpdateEntitiesLogic,
  responseFormatter: bulkUpdateEntitiesResponseFormatter,
};
