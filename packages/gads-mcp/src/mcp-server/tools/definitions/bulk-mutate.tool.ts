// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type GAdsEntityType } from "../utils/entity-mapping.js";
import { addParentValidationIssue } from "../utils/parent-id-validation.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "gads_bulk_mutate";
const TOOL_TITLE = "Bulk Mutate Google Ads Entities";
const TOOL_DESCRIPTION = `Execute multiple create/update/remove operations in a single API call.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

All operations must target the same entity type and customer. By default, all operations
succeed or all fail atomically. Set \`partialFailure: true\` to allow partial success.

Each operation object must contain exactly one of:
- \`{ create: { ...fields } }\` — create a new entity
- \`{ update: { ...fields, resourceName: "customers/{id}/{type}/{entityId}" }, updateMask: "field1,field2" }\` — update
- \`{ remove: "customers/{id}/{type}/{entityId}" }\` — remove

Maximum: thousands of operations per call (subject to Google Ads API limits).

**Composite resource names required for:** \`ad\` → use \`customers/{id}/adGroupAds/{adGroupId}~{adId}\`, \`keyword\` → use \`customers/{id}/adGroupCriteria/{adGroupId}~{criterionId}\`.`;

export const BulkMutateInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to mutate"),
    customerId: z
      .string()
      .min(1)
      .describe("Google Ads customer ID (no dashes)"),
    operations: z
      .array(z.record(z.any()))
      .min(1)
      .max(5000)
      .describe("Array of mutate operation objects (create/update/remove)"),
    partialFailure: z
      .boolean()
      .optional()
      .default(false)
      .describe("Allow partial success (default: false = atomic)"),
  })
  .superRefine((input, ctx) => {
    addParentValidationIssue(
      ctx,
      input.entityType as GAdsEntityType,
      input as Record<string, unknown>
    );
  })
  .describe("Parameters for bulk mutate operations");

export const BulkMutateOutputSchema = z
  .object({
    mutateResult: z.record(z.any()).describe("Full mutate response"),
    operationCount: z.number(),
    timestamp: z.string().datetime(),
  })
  .describe("Bulk mutate result");

type BulkMutateInput = z.infer<typeof BulkMutateInputSchema>;
type BulkMutateOutput = z.infer<typeof BulkMutateOutputSchema>;

export async function bulkMutateLogic(
  input: BulkMutateInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkMutateOutput> {
  const { gadsService } = resolveSessionServices(sdkContext);

  const result = await gadsService.bulkMutate(
    input.entityType as GAdsEntityType,
    input.customerId,
    input.operations,
    input.partialFailure,
    context
  );

  return {
    mutateResult: result as Record<string, any>,
    operationCount: input.operations.length,
    timestamp: new Date().toISOString(),
  };
}

export function bulkMutateResponseFormatter(result: BulkMutateOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Bulk mutate completed: ${result.operationCount} operations\n${JSON.stringify(result.mutateResult, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const bulkMutateTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BulkMutateInputSchema,
  outputSchema: BulkMutateOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Batch create ad groups",
      input: {
        entityType: "adGroup",
        customerId: "1234567890",
        operations: [
          { create: { name: "Brand Terms", campaign: "customers/1234567890/campaigns/123456", type: "SEARCH_STANDARD", status: "PAUSED", cpcBidMicros: "1500000" } },
          { create: { name: "Generic Terms", campaign: "customers/1234567890/campaigns/123456", type: "SEARCH_STANDARD", status: "PAUSED", cpcBidMicros: "2000000" } },
        ],
      },
    },
    {
      label: "Mixed operations with partial failure",
      input: {
        entityType: "campaign",
        customerId: "1234567890",
        operations: [
          { update: { resourceName: "customers/1234567890/campaigns/111", name: "Updated Campaign Name" }, updateMask: "name" },
          { remove: "customers/1234567890/campaigns/222" },
        ],
        partialFailure: true,
      },
    },
  ],
  logic: bulkMutateLogic,
  responseFormatter: bulkMutateResponseFormatter,
};