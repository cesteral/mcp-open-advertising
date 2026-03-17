// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getBulkEntityTypeEnum, type TtdEntityType } from "../utils/entity-mapping.js";
import {
  addParentValidationIssue,
  mergeParentIdsIntoData,
} from "../utils/parent-id-validation.js";
import { BulkOperationResultSchema } from "@cesteral/shared";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_bulk_create_entities";
const TOOL_TITLE = "Bulk Create TTD Entities";
const TOOL_DESCRIPTION = `Create multiple The Trade Desk entities of the same type in a single batch operation.

**Supported entity types for bulk create:** ${getBulkEntityTypeEnum().join(", ")}

Provide an array of entity data objects. Each item is created independently — partial failures are possible and reported per-item.`;

export const BulkCreateEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getBulkEntityTypeEnum())
      .describe("Type of entities to create (campaign or adGroup)"),
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID for all items (required for campaign/adGroup)"),
    campaignId: z
      .string()
      .optional()
      .describe("Campaign ID for all items (required for adGroup)"),
    items: z
      .array(z.record(z.any()))
      .min(1)
      .max(50)
      .describe("Array of entity data objects to create (max 50)"),
  })
  .superRefine((input, ctx) => {
    input.items.forEach((item, index) => {
      addParentValidationIssue(
        ctx,
        input.entityType as TtdEntityType,
        input as Record<string, unknown>,
        item,
        ["items", index]
      );
    });
  })
  .describe("Parameters for bulk creating TTD entities");

export const BulkCreateEntitiesOutputSchema = z
  .object({
    entityType: z.string(),
    totalRequested: z.number(),
    successCount: z.number(),
    failureCount: z.number(),
    results: z.array(BulkOperationResultSchema),
    timestamp: z.string().datetime(),
  })
  .describe("Bulk entity creation results");

type BulkCreateInput = z.infer<typeof BulkCreateEntitiesInputSchema>;
type BulkCreateOutput = z.infer<typeof BulkCreateEntitiesOutputSchema>;

export async function bulkCreateEntitiesLogic(
  input: BulkCreateInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkCreateOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);
  const items = input.items.map((item) =>
    mergeParentIdsIntoData(item, input as Record<string, unknown>)
  );

  const { results } = await ttdService.bulkCreateEntities(
    input.entityType as TtdEntityType,
    items,
    context
  );

  const succeeded = results.filter((r) => r.success).length;

  return {
    entityType: input.entityType,
    totalRequested: items.length,
    successCount: succeeded,
    failureCount: items.length - succeeded,
    results: results.map((r) => ({
      success: r.success,
      entity: r.entity as Record<string, any> | undefined,
      error: r.error,
    })),
    timestamp: new Date().toISOString(),
  };
}

export function bulkCreateEntitiesResponseFormatter(result: BulkCreateOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Bulk create ${result.entityType}: ${result.successCount}/${result.totalRequested} succeeded, ${result.failureCount} failed\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: true,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Create 2 campaigns in one call",
      input: {
        entityType: "campaign",
        advertiserId: "adv123abc",
        items: [
          {
            CampaignName: "Q1 Brand Awareness",
            Budget: { Amount: 50000, CurrencyCode: "USD" },
            StartDate: "2025-01-01T00:00:00Z",
            EndDate: "2025-03-31T23:59:59Z",
            PacingMode: "PaceEvenly",
          },
          {
            CampaignName: "Q1 Retargeting",
            Budget: { Amount: 20000, CurrencyCode: "USD" },
            StartDate: "2025-01-01T00:00:00Z",
            EndDate: "2025-03-31T23:59:59Z",
            PacingMode: "PaceAhead",
          },
        ],
      },
    },
    {
      label: "Create 2 ad groups under a campaign",
      input: {
        entityType: "adGroup",
        advertiserId: "adv123abc",
        campaignId: "camp456def",
        items: [
          {
            AdGroupName: "Prospecting - Display",
            RTBAttributes: {
              BudgetSettings: { DailyBudget: { Amount: 500, CurrencyCode: "USD" } },
              BaseBidCPM: { Amount: 3.5, CurrencyCode: "USD" },
            },
          },
          {
            AdGroupName: "Prospecting - Video",
            RTBAttributes: {
              BudgetSettings: { DailyBudget: { Amount: 1000, CurrencyCode: "USD" } },
              BaseBidCPM: { Amount: 8.0, CurrencyCode: "USD" },
            },
          },
        ],
      },
    },
  ],
  logic: bulkCreateEntitiesLogic,
  responseFormatter: bulkCreateEntitiesResponseFormatter,
};