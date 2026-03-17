// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type CM360EntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "cm360_bulk_update_status";
const TOOL_TITLE = "Bulk Update CM360 Entity Status";
const TOOL_DESCRIPTION = `Batch update the status of multiple CM360 entities.

Each entity is fetched first then updated (CM360 uses PUT/replace semantics). Loops individual GET+PUT calls with rate limiting. At ~1 QPS, 50 items takes ~100 seconds.

Common status values: ACTIVE, ARCHIVED (campaigns), ACTIVE/PAUSED (placements, ads).`;

export const BulkUpdateStatusInputSchema = z
  .object({
    profileId: z
      .string()
      .min(1)
      .describe("CM360 User Profile ID"),
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to update"),
    entityIds: z
      .array(z.string().min(1))
      .min(1)
      .max(50)
      .describe("Entity IDs to update (max 50)"),
    status: z
      .string()
      .min(1)
      .describe("New status value (e.g., ARCHIVED, ACTIVE, PAUSED)"),
  })
  .describe("Parameters for bulk status update");

export const BulkUpdateStatusOutputSchema = z
  .object({
    updated: z.number().describe("Number of entities updated"),
    failed: z.number().describe("Number of entities that failed"),
    results: z.array(
      z.object({
        entityId: z.string(),
        success: z.boolean(),
        error: z.string().optional(),
      })
    ).describe("Per-entity results"),
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
  const { cm360Service } = resolveSessionServices(sdkContext);

  const results: BulkUpdateStatusOutput["results"] = [];
  let updated = 0;
  let failed = 0;

  for (const entityId of input.entityIds) {
    try {
      // CM360 uses PUT (full replacement) — fetch current entity first to avoid data loss
      const current = (await cm360Service.getEntity(
        input.entityType as CM360EntityType,
        input.profileId,
        entityId,
        context
      )) as Record<string, unknown>;

      await cm360Service.updateEntity(
        input.entityType as CM360EntityType,
        input.profileId,
        { ...current, status: input.status },
        context
      );
      results.push({ entityId, success: true });
      updated++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ entityId, success: false, error: message });
      failed++;
    }
  }

  return {
    updated,
    failed,
    results,
    timestamp: new Date().toISOString(),
  };
}

export function bulkUpdateStatusResponseFormatter(result: BulkUpdateStatusOutput): McpTextContent[] {
  const summary = `Bulk status update: ${result.updated} succeeded, ${result.failed} failed`;
  const details = result.results
    .filter((r) => !r.success)
    .map((r) => `  - ${r.entityId}: ${r.error}`)
    .join("\n");
  const failureDetails = details ? `\n\nFailures:\n${details}` : "";

  return [
    {
      type: "text" as const,
      text: `${summary}${failureDetails}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const bulkUpdateStatusTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BulkUpdateStatusInputSchema,
  outputSchema: BulkUpdateStatusOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: true,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Archive multiple campaigns",
      input: {
        profileId: "123456",
        entityType: "campaign",
        entityIds: ["111", "222", "333"],
        status: "ARCHIVED",
      },
    },
  ],
  logic: bulkUpdateStatusLogic,
  responseFormatter: bulkUpdateStatusResponseFormatter,
};