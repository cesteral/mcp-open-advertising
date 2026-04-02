// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type SnapchatEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "snapchat_bulk_update_status";
const TOOL_TITLE = "Snapchat Bulk Status Update";
const TOOL_DESCRIPTION = `Batch update the status of Snapchat Ads entities.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**Status values:** ACTIVE, PAUSED

Snapchat status updates are sent as full-object PUTs to the parent collection route.`;

export const BulkUpdateStatusInputSchema = z
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
    entityIds: z
      .array(z.string().min(1))
      .min(1)
      .max(20)
      .describe("Array of entity IDs to update (max 20)"),
    operationStatus: z
      .enum(["ACTIVE", "PAUSED"])
      .describe("Target status to apply"),
  })
  .superRefine((data, ctx) => {
    if (data.entityType === "adGroup" && !data.campaignId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["campaignId"], message: "campaignId is required for adGroup status updates" });
    }
    if (data.entityType === "ad" && !data.adSquadId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["adSquadId"], message: "adSquadId is required for ad status updates" });
    }
  })
  .describe("Parameters for bulk status update of Snapchat Ads entities");

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
  const { snapchatService } = resolveSessionServices(sdkContext);

  const result = await snapchatService.bulkUpdateStatus(
    input.entityType as SnapchatEntityType,
    {
      adAccountId: input.adAccountId,
      ...(input.campaignId ? { campaignId: input.campaignId } : {}),
      ...(input.adSquadId ? { adSquadId: input.adSquadId } : {}),
    },
    input.entityIds,
    input.operationStatus as "ACTIVE" | "PAUSED",
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
        adAccountId: "1234567890",
        entityIds: ["1800111111111", "1800222222222"],
        operationStatus: "PAUSED",
      },
    },
    {
      label: "Activate multiple ad groups",
      input: {
        entityType: "adGroup",
        adAccountId: "1234567890",
        campaignId: "1800111111111",
        entityIds: ["1700111111111"],
        operationStatus: "ACTIVE",
      },
    },
  ],
  logic: bulkUpdateStatusLogic,
  responseFormatter: bulkUpdateStatusResponseFormatter,
};
