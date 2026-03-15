// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type MsAdsEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_delete_entity";
const TOOL_TITLE = "Delete Microsoft Ads Entity";
const TOOL_DESCRIPTION = `Delete one or more Microsoft Advertising entities by their IDs.

This is a destructive operation — entities will be permanently deleted.`;

export const DeleteEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to delete"),
    entityIds: z
      .array(z.string())
      .min(1)
      .describe("Array of entity IDs to delete"),
    additionalParams: z
      .record(z.unknown())
      .optional()
      .describe("Additional parameters (e.g., AccountId)"),
  })
  .describe("Parameters for deleting Microsoft Ads entities");

export const DeleteEntityOutputSchema = z
  .object({
    result: z.record(z.any()),
    entityType: z.string(),
    deletedCount: z.number(),
    timestamp: z.string().datetime(),
  })
  .describe("Entity deletion result");

type DeleteEntityInput = z.infer<typeof DeleteEntityInputSchema>;
type DeleteEntityOutput = z.infer<typeof DeleteEntityOutputSchema>;

export async function deleteEntityLogic(
  input: DeleteEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DeleteEntityOutput> {
  const { msadsService } = resolveSessionServices(sdkContext);

  const result = (await msadsService.deleteEntity(
    input.entityType as MsAdsEntityType,
    input.entityIds,
    input.additionalParams,
    context
  )) as Record<string, unknown>;

  return {
    result,
    entityType: input.entityType,
    deletedCount: input.entityIds.length,
    timestamp: new Date().toISOString(),
  };
}

export function deleteEntityResponseFormatter(result: DeleteEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Deleted ${result.deletedCount} ${result.entityType} entities\n\nResult:\n${JSON.stringify(result.result, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
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
      label: "Delete campaigns",
      input: { entityType: "campaign", entityIds: ["123456", "789012"] },
    },
  ],
  logic: deleteEntityLogic,
  responseFormatter: deleteEntityResponseFormatter,
};