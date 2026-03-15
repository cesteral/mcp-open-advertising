// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type AmazonDspEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "amazon_dsp_bulk_update_status";
const TOOL_TITLE = "AmazonDsp Bulk Status Update";
const TOOL_DESCRIPTION = `Batch update the status of Amazon DSP entities.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**Status values:**
- **DELIVERING** — Activate/resume entities
- **PAUSED** — Pause entities
- **ARCHIVED** — Archive entities (equivalent to soft delete)

Amazon DSP updates each entity individually via PUT to the entity-specific path.`;

export const BulkUpdateStatusInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to update"),
    profileId: z
      .string()
      .min(1)
      .describe("AmazonDsp Advertiser ID"),
    entityIds: z
      .array(z.string().min(1))
      .min(1)
      .max(20)
      .describe("Array of entity IDs to update (max 20)"),
    operationStatus: z
      .enum(["DELIVERING", "PAUSED", "ARCHIVED"])
      .describe("Target status to apply (DELIVERING=active, PAUSED=paused, ARCHIVED=soft delete)"),
  })
  .describe("Parameters for bulk status update of AmazonDsp Ads entities");

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
  const { amazonDspService } = resolveSessionServices(sdkContext);

  const result = await amazonDspService.bulkUpdateStatus(
    input.entityType as AmazonDspEntityType,
    input.entityIds,
    input.operationStatus as string,
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
      label: "Pause multiple orders (campaigns)",
      input: {
        entityType: "order",
        profileId: "1234567890",
        entityIds: ["ord_111111", "ord_222222"],
        operationStatus: "PAUSED",
      },
    },
    {
      label: "Resume multiple line items",
      input: {
        entityType: "lineItem",
        profileId: "1234567890",
        entityIds: ["li_111111"],
        operationStatus: "DELIVERING",
      },
    },
  ],
  logic: bulkUpdateStatusLogic,
  responseFormatter: bulkUpdateStatusResponseFormatter,
};