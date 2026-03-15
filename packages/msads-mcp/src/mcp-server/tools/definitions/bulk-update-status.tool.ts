// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type MsAdsEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_bulk_update_status";
const TOOL_TITLE = "Bulk Update Microsoft Ads Entity Status";
const TOOL_DESCRIPTION = `Batch update the status of multiple Microsoft Advertising entities.

Valid statuses: Active, Paused, Deleted (varies by entity type).`;

export const BulkUpdateStatusInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to update"),
    entityIds: z
      .array(z.string())
      .min(1)
      .describe("Array of entity IDs"),
    status: z
      .string()
      .describe("New status (Active, Paused, Deleted)"),
  })
  .describe("Parameters for bulk status update");

export const BulkUpdateStatusOutputSchema = z
  .object({
    result: z.record(z.any()),
    entityType: z.string(),
    count: z.number(),
    status: z.string(),
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
  const { msadsService } = resolveSessionServices(sdkContext);

  const result = (await msadsService.bulkUpdateStatus(
    input.entityType as MsAdsEntityType,
    input.entityIds,
    input.status,
    context
  )) as Record<string, unknown>;

  return {
    result,
    entityType: input.entityType,
    count: input.entityIds.length,
    status: input.status,
    timestamp: new Date().toISOString(),
  };
}

export function bulkUpdateStatusResponseFormatter(result: BulkUpdateStatusOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Updated ${result.count} ${result.entityType} entities to status: ${result.status}\n\nResult:\n${JSON.stringify(result.result, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Pause multiple campaigns",
      input: {
        entityType: "campaign",
        entityIds: ["123", "456"],
        status: "Paused",
      },
    },
  ],
  logic: bulkUpdateStatusLogic,
  responseFormatter: bulkUpdateStatusResponseFormatter,
};