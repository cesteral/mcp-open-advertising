// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "meta_delete_entity";
const TOOL_TITLE = "Delete Meta Ads Entity";
const TOOL_DESCRIPTION = `Delete a Meta Ads entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Uses DELETE /{entityId}.

**Gotchas:**
- ACTIVE entities must be paused before deletion.
- For campaigns, setting status to ARCHIVED is often preferred over deletion.
- ARCHIVED status is permanent and cannot be reversed.
- Writes are rate-limited at 3x read cost.`;

export const DeleteEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to delete"),
    entityId: z
      .string()
      .min(1)
      .describe("The entity ID to delete"),
  })
  .describe("Parameters for deleting a Meta Ads entity");

export const DeleteEntityOutputSchema = z
  .object({
    success: z.boolean(),
    entityId: z.string(),
    entityType: z.string(),
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
  const { metaService } = resolveSessionServices(sdkContext);

  const result = await metaService.deleteEntity(input.entityId, context);
  const success = (result as Record<string, unknown>)?.success === true;

  return {
    success,
    entityId: input.entityId,
    entityType: input.entityType,
    timestamp: new Date().toISOString(),
  };
}

export function deleteEntityResponseFormatter(result: DeleteEntityOutput): McpTextContent[] {
  const status = result.success ? "deleted successfully" : "deletion returned unexpected response";
  return [
    {
      type: "text" as const,
      text: `${result.entityType} ${result.entityId} ${status}\n\nTimestamp: ${result.timestamp}`,
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
      label: "Delete an ad creative",
      input: {
        entityType: "adCreative",
        entityId: "23456789012345",
      },
    },
  ],
  logic: deleteEntityLogic,
  responseFormatter: deleteEntityResponseFormatter,
};