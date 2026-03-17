// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type LinkedInEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "linkedin_delete_entity";
const TOOL_TITLE = "Delete LinkedIn Ads Entity";
const TOOL_DESCRIPTION = `Delete a LinkedIn Ads entity by URN.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**Gotchas:**
- Active campaigns/campaign groups must be paused before deletion.
- Deletion is permanent and cannot be undone.
- Creative deletion will unlink it from any campaigns.`;

export const DeleteEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to delete"),
    entityUrn: z
      .string()
      .min(1)
      .describe("The entity URN to delete (e.g., urn:li:sponsoredCampaign:123)"),
  })
  .describe("Parameters for deleting a LinkedIn Ads entity");

export const DeleteEntityOutputSchema = z
  .object({
    success: z.boolean(),
    entityUrn: z.string(),
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
  const { linkedInService } = resolveSessionServices(sdkContext);

  await linkedInService.deleteEntity(
    input.entityType as LinkedInEntityType,
    input.entityUrn,
    context
  );

  return {
    success: true,
    entityUrn: input.entityUrn,
    entityType: input.entityType,
    timestamp: new Date().toISOString(),
  };
}

export function deleteEntityResponseFormatter(result: DeleteEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `${result.entityType} ${result.entityUrn} deleted successfully\n\nTimestamp: ${result.timestamp}`,
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
      label: "Delete a campaign",
      input: {
        entityType: "campaign",
        entityUrn: "urn:li:sponsoredCampaign:123456789",
      },
    },
  ],
  logic: deleteEntityLogic,
  responseFormatter: deleteEntityResponseFormatter,
};