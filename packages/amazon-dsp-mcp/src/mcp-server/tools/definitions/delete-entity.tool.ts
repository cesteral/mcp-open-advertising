// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type AmazonDspEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "amazon_dsp_delete_entity";
const TOOL_TITLE = "Delete AmazonDsp Ads Entity";
const TOOL_DESCRIPTION = `Archive one or more Amazon DSP entities (equivalent to deletion).

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Amazon DSP has no DELETE endpoint. Archiving sets status to ARCHIVED via PUT.
Archived entities cannot be recovered. Consider using \`amazon_dsp_bulk_update_status\` with PAUSED first.`;

export const DeleteEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to delete"),
    profileId: z
      .string()
      .min(1)
      .describe("AmazonDsp Advertiser ID"),
    entityIds: z
      .array(z.string().min(1))
      .min(1)
      .max(20)
      .describe("Array of entity IDs to delete (max 20)"),
  })
  .describe("Parameters for deleting AmazonDsp Ads entities");

export const DeleteEntityOutputSchema = z
  .object({
    entityType: z.string(),
    totalRequested: z.number(),
    totalSucceeded: z.number(),
    totalFailed: z.number(),
    results: z.array(
      z.object({
        entityId: z.string(),
        success: z.boolean(),
        error: z.string().optional(),
      })
    ),
    timestamp: z.string().datetime(),
  })
  .describe("Entity delete result");

type DeleteEntityInput = z.infer<typeof DeleteEntityInputSchema>;
type DeleteEntityOutput = z.infer<typeof DeleteEntityOutputSchema>;

export async function deleteEntityLogic(
  input: DeleteEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DeleteEntityOutput> {
  const { amazonDspService } = resolveSessionServices(sdkContext);

  const results: Array<{ entityId: string; success: boolean; error?: string }> = [];

  // Archive each entity individually (Amazon DSP has no bulk delete endpoint)
  for (const entityId of input.entityIds) {
    try {
      await amazonDspService.deleteEntity(
        input.entityType as AmazonDspEntityType,
        entityId,
        context
      );
      results.push({ entityId, success: true });
    } catch (error) {
      results.push({
        entityId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const totalSucceeded = results.filter((r) => r.success).length;

  return {
    entityType: input.entityType,
    totalRequested: input.entityIds.length,
    totalSucceeded,
    totalFailed: input.entityIds.length - totalSucceeded,
    results,
    timestamp: new Date().toISOString(),
  };
}

export function deleteEntityResponseFormatter(result: DeleteEntityOutput): McpTextContent[] {
  const lines: string[] = [
    `${result.entityType} deletions: ${result.totalSucceeded}/${result.totalRequested} succeeded, ${result.totalFailed} failed`,
    "",
  ];

  for (const r of result.results) {
    if (r.success) {
      lines.push(`  ${r.entityId}: archived`);
    } else {
      lines.push(`  ${r.entityId}: FAILED - ${r.error}`);
    }
  }

  lines.push("", `Timestamp: ${result.timestamp}`);

  return [{ type: "text" as const, text: lines.join("\n") }];
}

export const deleteEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: DeleteEntityInputSchema,
  outputSchema: DeleteEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: true,
  },
  inputExamples: [
    {
      label: "Archive a single order (campaign)",
      input: {
        entityType: "order",
        profileId: "1234567890",
        entityIds: ["ord_123456789"],
      },
    },
    {
      label: "Archive multiple line items",
      input: {
        entityType: "lineItem",
        profileId: "1234567890",
        entityIds: ["li_111111", "li_222222"],
      },
    },
  ],
  logic: deleteEntityLogic,
  responseFormatter: deleteEntityResponseFormatter,
};