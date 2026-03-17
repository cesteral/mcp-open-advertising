// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type PinterestEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "pinterest_update_entity";
const TOOL_TITLE = "Update Pinterest Ads Entity";
const TOOL_DESCRIPTION = `Update a Pinterest Ads entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Pinterest uses POST for updates with entity ID in the body. Only provided fields are modified.

**Gotchas:**
- Use \`pinterest_bulk_update_status\` for status-only changes (more efficient)
- ad_account_id is automatically injected`;

export const UpdateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to update"),
    adAccountId: z
      .string()
      .min(1)
      .describe("Pinterest Advertiser ID"),
    entityId: z
      .string()
      .min(1)
      .describe("The entity ID to update"),
    data: z
      .record(z.any())
      .describe("Fields to update as key-value pairs"),
  })
  .describe("Parameters for updating a Pinterest Ads entity");

export const UpdateEntityOutputSchema = z
  .object({
    entityId: z.string(),
    entityType: z.string(),
    updated: z.boolean(),
    timestamp: z.string().datetime(),
  })
  .describe("Entity update result");

type UpdateEntityInput = z.infer<typeof UpdateEntityInputSchema>;
type UpdateEntityOutput = z.infer<typeof UpdateEntityOutputSchema>;

export async function updateEntityLogic(
  input: UpdateEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UpdateEntityOutput> {
  const { pinterestService } = resolveSessionServices(sdkContext);

  await pinterestService.updateEntity(
    input.entityType as PinterestEntityType,
    { adAccountId: input.adAccountId },
    input.entityId,
    input.data,
    context
  );

  return {
    entityId: input.entityId,
    entityType: input.entityType,
    updated: true,
    timestamp: new Date().toISOString(),
  };
}

export function updateEntityResponseFormatter(result: UpdateEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `${result.entityType} ${result.entityId} updated successfully\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const updateEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UpdateEntityInputSchema,
  outputSchema: UpdateEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Update campaign name and budget",
      input: {
        entityType: "campaign",
        adAccountId: "1234567890",
        entityId: "1800123456789",
        data: {
          campaign_name: "Updated Campaign Name",
          budget: 200,
        },
      },
    },
    {
      label: "Update ad group bid",
      input: {
        entityType: "adGroup",
        adAccountId: "1234567890",
        entityId: "1700123456789",
        data: {
          bid_price: 1.5,
        },
      },
    },
  ],
  logic: updateEntityLogic,
  responseFormatter: updateEntityResponseFormatter,
};