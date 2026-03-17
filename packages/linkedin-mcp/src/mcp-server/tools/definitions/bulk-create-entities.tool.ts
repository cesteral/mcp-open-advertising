// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type LinkedInEntityType } from "../utils/entity-mapping.js";
import { BulkOperationResultSchema } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "linkedin_bulk_create_entities";
const TOOL_TITLE = "Bulk Create LinkedIn Ads Entities";
const TOOL_DESCRIPTION = `Batch create multiple LinkedIn Ads entities of the same type.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Creates entities individually with concurrency (max 5 concurrent requests).
Each item must be a complete entity payload (same as linkedin_create_entity data).

**Gotchas:**
- Max 50 items per call.
- Partial failures are allowed — check results for individual errors.`;

export const BulkCreateEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to create"),
    items: z
      .array(z.record(z.any()))
      .min(1)
      .max(50)
      .describe("Entity payloads to create (max 50)"),
  })
  .describe("Parameters for bulk entity creation");

export const BulkCreateEntitiesOutputSchema = z
  .object({
    results: z.array(BulkOperationResultSchema),
    successCount: z.number(),
    failureCount: z.number(),
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
  const { linkedInService } = resolveSessionServices(sdkContext);

  const result = await linkedInService.bulkCreateEntities(
    input.entityType as LinkedInEntityType,
    input.items,
    context
  );

  const successCount = result.results.filter((r) => r.success).length;

  return {
    results: result.results.map((r) => ({
      success: r.success,
      entity: r.entity as Record<string, unknown> | undefined,
      error: r.error,
    })),
    successCount,
    failureCount: result.results.length - successCount,
    timestamp: new Date().toISOString(),
  };
}

export function bulkCreateEntitiesResponseFormatter(
  result: BulkCreateEntitiesOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Bulk create: ${result.successCount} succeeded, ${result.failureCount} failed\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    idempotentHint: false,
    destructiveHint: true,
  },
  inputExamples: [
    {
      label: "Create multiple campaigns",
      input: {
        entityType: "campaign",
        items: [
          {
            name: "Campaign A",
            campaignGroup: "urn:li:sponsoredCampaignGroup:987654321",
            account: "urn:li:sponsoredAccount:123456789",
            type: "SPONSORED_UPDATES",
            objectiveType: "BRAND_AWARENESS",
            status: "DRAFT",
          },
          {
            name: "Campaign B",
            campaignGroup: "urn:li:sponsoredCampaignGroup:987654321",
            account: "urn:li:sponsoredAccount:123456789",
            type: "SPONSORED_UPDATES",
            objectiveType: "WEBSITE_TRAFFIC",
            status: "DRAFT",
          },
        ],
      },
    },
  ],
  logic: bulkCreateEntitiesLogic,
  responseFormatter: bulkCreateEntitiesResponseFormatter,
};