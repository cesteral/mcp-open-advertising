// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type MsAdsEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_update_entity";
const TOOL_TITLE = "Update Microsoft Ads Entity";
const TOOL_DESCRIPTION = `Update an existing Microsoft Advertising entity.

Wrap entities in their plural key with the Id field included (e.g., { "Campaigns": [{ "Id": 123, "Name": "Updated" }] }).
Only include fields you want to change — Microsoft Ads supports partial updates.`;

export const UpdateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to update"),
    data: z
      .record(z.unknown())
      .describe("Entity data payload with Id and fields to update"),
  })
  .describe("Parameters for updating a Microsoft Ads entity");

export const UpdateEntityOutputSchema = z
  .object({
    result: z.record(z.any()),
    entityType: z.string(),
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
  const { msadsService } = resolveSessionServices(sdkContext);

  const result = (await msadsService.updateEntity(
    input.entityType as MsAdsEntityType,
    input.data,
    context
  )) as Record<string, unknown>;

  return {
    result,
    entityType: input.entityType,
    timestamp: new Date().toISOString(),
  };
}

export function updateEntityResponseFormatter(result: UpdateEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Updated ${result.entityType} entity\n\nResult:\n${JSON.stringify(result.result, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
      label: "Update campaign name",
      input: {
        entityType: "campaign",
        data: { Campaigns: [{ Id: 123456, Name: "Updated Campaign Name" }] },
      },
    },
  ],
  logic: updateEntityLogic,
  responseFormatter: updateEntityResponseFormatter,
};