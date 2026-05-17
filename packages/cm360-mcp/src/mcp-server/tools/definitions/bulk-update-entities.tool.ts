// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type CM360EntityType } from "../utils/entity-mapping.js";
import { elicitBulkMutationConfirmation, hasSensitiveBulkField } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "cm360_bulk_update_entities";
const TOOL_TITLE = "Bulk Update CM360 Entities";
const TOOL_DESCRIPTION = `Batch update multiple CM360 entities of the same type.

Each item must include the id field (CM360 uses PUT/replace semantics). Loops individual update calls with rate limiting. Max 50 items per call.`;

export const BulkUpdateEntitiesInputSchema = z
  .object({
    profileId: z.string().min(1).describe("CM360 User Profile ID"),
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entities to update"),
    items: z
      .array(
        z.object({
          entityId: z.string().min(1).describe("Entity ID to update"),
          data: z.record(z.any()).describe("Full entity data including id field"),
        })
      )
      .min(1)
      .max(50)
      .describe("Array of update items (max 50)"),
  })
  .describe("Parameters for bulk entity update");

export const BulkUpdateEntitiesOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    updated: z.number().describe("Number of entities updated"),
    failed: z.number().describe("Number that failed"),
    results: z
      .array(
        z.object({
          entityId: z.string(),
          success: z.boolean(),
          entity: z.record(z.any()).optional(),
          error: z.string().optional(),
        })
      )
      .describe("Per-item results"),
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
  const payloads = input.items.map((it) => it.data ?? {});
  const confirmed = await elicitBulkMutationConfirmation({
    count: input.items.length,
    entityLabel: input.entityType,
    summary: "Applying field updates across multiple CM360 entities (PUT/replace semantics).",
    hasSensitiveFieldChange: hasSensitiveBulkField(payloads),
    impactPreview: input.items.map((it) => it.entityId),
    sdkContext,
  });
  if (!confirmed) {
    return {
      confirmed: false,
      declineReason: "user_declined",
      updated: 0,
      failed: 0,
      results: [],
      timestamp: new Date().toISOString(),
    };
  }

  const { cm360Service } = resolveSessionServices(sdkContext);

  const bulkResults = await cm360Service.bulkUpdateEntities(
    input.entityType as CM360EntityType,
    input.profileId,
    input.items,
    context
  );

  let updated = 0;
  let failed = 0;
  const results: BulkUpdateEntitiesOutput["results"] = bulkResults.map((r) => {
    if (r.success) {
      updated++;
      return {
        entityId: r.entityId,
        success: true,
        entity: r.entity as unknown as Record<string, any>,
      };
    }
    failed++;
    return { entityId: r.entityId, success: false, error: r.error };
  });

  return {
    confirmed: true,
    updated,
    failed,
    results,
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
  const summary = `Bulk update: ${result.updated} succeeded, ${result.failed} failed`;
  const failures = result.results
    .filter((r) => !r.success)
    .map((r) => `  - ${r.entityId}: ${r.error}`)
    .join("\n");
  const failureDetails = failures ? `\n\nFailures:\n${failures}` : "";

  return [
    {
      type: "text" as const,
      text: `${summary}${failureDetails}\n\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: true,
    destructiveHint: true,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Update multiple campaign names",
      input: {
        profileId: "123456",
        entityType: "campaign",
        items: [
          {
            entityId: "111",
            data: { id: "111", name: "Campaign A - Updated", advertiserId: "789" },
          },
          {
            entityId: "222",
            data: { id: "222", name: "Campaign B - Updated", advertiserId: "789" },
          },
        ],
      },
    },
  ],
  logic: bulkUpdateEntitiesLogic,
  responseFormatter: bulkUpdateEntitiesResponseFormatter,
};
