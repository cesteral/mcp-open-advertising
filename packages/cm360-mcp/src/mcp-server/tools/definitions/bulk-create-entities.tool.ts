// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type CM360EntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "cm360_bulk_create_entities";
const TOOL_TITLE = "Bulk Create CM360 Entities";
const TOOL_DESCRIPTION = `Batch create multiple CM360 entities of the same type.

Loops individual create calls with rate limiting. At ~1 QPS, 50 items takes ~50 seconds. Max 50 items per call.`;

export const BulkCreateEntitiesInputSchema = z
  .object({
    profileId: z
      .string()
      .min(1)
      .describe("CM360 User Profile ID"),
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to create"),
    items: z
      .array(z.record(z.any()))
      .min(1)
      .max(50)
      .describe("Array of entity data objects to create (max 50)"),
  })
  .describe("Parameters for bulk entity creation");

export const BulkCreateEntitiesOutputSchema = z
  .object({
    created: z.number().describe("Number of entities created"),
    failed: z.number().describe("Number that failed"),
    results: z.array(
      z.object({
        index: z.number(),
        success: z.boolean(),
        entity: z.record(z.any()).optional(),
        error: z.string().optional(),
      })
    ).describe("Per-item results"),
    timestamp: z.string().datetime(),
  })
  .describe("Bulk creation result");

type BulkCreateEntitiesInput = z.infer<typeof BulkCreateEntitiesInputSchema>;
type BulkCreateEntitiesOutput = z.infer<typeof BulkCreateEntitiesOutputSchema>;

export async function bulkCreateEntitiesLogic(
  input: BulkCreateEntitiesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkCreateEntitiesOutput> {
  const { cm360Service } = resolveSessionServices(sdkContext);

  const results: BulkCreateEntitiesOutput["results"] = [];
  let created = 0;
  let failed = 0;

  for (let i = 0; i < input.items.length; i++) {
    try {
      const entity = await cm360Service.createEntity(
        input.entityType as CM360EntityType,
        input.profileId,
        input.items[i],
        context
      );
      results.push({ index: i, success: true, entity: entity as Record<string, any> });
      created++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ index: i, success: false, error: message });
      failed++;
    }
  }

  return {
    created,
    failed,
    results,
    timestamp: new Date().toISOString(),
  };
}

export function bulkCreateEntitiesResponseFormatter(result: BulkCreateEntitiesOutput): McpTextContent[] {
  const summary = `Bulk create: ${result.created} succeeded, ${result.failed} failed`;
  const failures = result.results
    .filter((r) => !r.success)
    .map((r) => `  - Item ${r.index}: ${r.error}`)
    .join("\n");
  const failureDetails = failures ? `\n\nFailures:\n${failures}` : "";

  return [
    {
      type: "text" as const,
      text: `${summary}${failureDetails}\n\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: true,
    destructiveHint: true,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Create multiple placements",
      input: {
        profileId: "123456",
        entityType: "placement",
        items: [
          {
            name: "Homepage Banner 728x90",
            campaignId: "789012",
            siteId: "456789",
            compatibility: "DISPLAY",
            size: { width: 728, height: 90 },
          },
          {
            name: "Sidebar 300x250",
            campaignId: "789012",
            siteId: "456789",
            compatibility: "DISPLAY",
            size: { width: 300, height: 250 },
          },
        ],
      },
    },
  ],
  logic: bulkCreateEntitiesLogic,
  responseFormatter: bulkCreateEntitiesResponseFormatter,
};