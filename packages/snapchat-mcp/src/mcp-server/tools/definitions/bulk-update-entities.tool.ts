// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type SnapchatEntityType } from "../utils/entity-mapping.js";
import { BulkOperationResultSchema } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "snapchat_bulk_update_entities";
const TOOL_TITLE = "Snapchat Bulk Update Entities";
const TOOL_DESCRIPTION = `Batch update multiple Snapchat Ads entities of the same type.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Each item must include an \`entityId\` and a \`data\` object with fields to update.
The server fetches the current entities first so it can send the full payload Snapchat requires.

Max 50 items per call.`;

export const BulkUpdateEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to update"),
    adAccountId: z
      .string()
      .min(1)
      .describe("Snapchat Advertiser ID"),
    campaignId: z
      .string()
      .optional()
      .describe("Campaign ID required when entityType is 'adGroup'"),
    adSquadId: z
      .string()
      .optional()
      .describe("Ad Squad ID required when entityType is 'ad'"),
    items: z
      .array(
        z.object({
          entityId: z.string().min(1).describe("Entity ID to update"),
          data: z.record(z.any()).describe("Fields to update"),
        })
      )
      .min(1)
      .max(50)
      .describe("Array of update operations (max 50)"),
  })
  .superRefine((data, ctx) => {
    if (data.entityType === "adGroup" && !data.campaignId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["campaignId"], message: "campaignId is required for adGroup updates" });
    }
    if (data.entityType === "ad" && !data.adSquadId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["adSquadId"], message: "adSquadId is required for ad updates" });
    }
  })
  .describe("Parameters for bulk entity updates");

export const BulkUpdateEntitiesOutputSchema = z
  .object({
    totalRequested: z.number(),
    successCount: z.number(),
    failureCount: z.number(),
    results: z.array(
      BulkOperationResultSchema.extend({
        entityId: z.string(),
      })
    ),
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
  const { snapchatService } = resolveSessionServices(sdkContext);

  const bulkResult = await snapchatService.bulkUpdateEntities(
    input.entityType as SnapchatEntityType,
    {
      adAccountId: input.adAccountId,
      ...(input.campaignId ? { campaignId: input.campaignId } : {}),
      ...(input.adSquadId ? { adSquadId: input.adSquadId } : {}),
    },
    input.items,
    context
  );

  const totalSucceeded = bulkResult.results.filter((r) => r.success).length;

  return {
    totalRequested: input.items.length,
    successCount: totalSucceeded,
    failureCount: input.items.length - totalSucceeded,
    results: bulkResult.results,
    timestamp: new Date().toISOString(),
  };
}

export function bulkUpdateEntitiesResponseFormatter(result: BulkUpdateEntitiesOutput): McpTextContent[] {
  const lines: string[] = [
    `Bulk update: ${result.successCount}/${result.totalRequested} succeeded, ${result.failureCount} failed`,
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
        adAccountId: "1234567890",
        items: [
          { entityId: "1800111111111", data: { daily_budget_micro: 150000000 } },
          { entityId: "1800222222222", data: { daily_budget_micro: 250000000 } },
        ],
      },
    },
  ],
  logic: bulkUpdateEntitiesLogic,
  responseFormatter: bulkUpdateEntitiesResponseFormatter,
};
