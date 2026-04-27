// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type MsAdsEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_create_entity";
const TOOL_TITLE = "Create Microsoft Ads Entity";
const TOOL_DESCRIPTION = `Create a new Microsoft Advertising entity.

The data object should follow Microsoft Ads API v13 format. Wrap entities in their plural key (e.g., { "Campaigns": [{ "Name": "..." }] }).

Use the entity-schema and entity-examples MCP resources to discover required fields.`;

export const CreateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to create"),
    data: z.record(z.unknown()).describe("Entity data payload following Microsoft Ads API format"),
  })
  .describe("Parameters for creating a Microsoft Ads entity");

export const CreateEntityOutputSchema = z
  .object({
    result: z.record(z.any()).describe("API response with created entity IDs"),
    entityType: z.string(),
    timestamp: z.string().datetime(),
  })
  .describe("Entity creation result");

type CreateEntityInput = z.infer<typeof CreateEntityInputSchema>;
type CreateEntityOutput = z.infer<typeof CreateEntityOutputSchema>;

export async function createEntityLogic(
  input: CreateEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateEntityOutput> {
  const { msadsService } = resolveSessionServices(sdkContext);

  const result = (await msadsService.createEntity(
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

export function createEntityResponseFormatter(result: CreateEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Created ${result.entityType} entity\n\nResult:\n${JSON.stringify(result.result, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const createEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CreateEntityInputSchema,
  outputSchema: CreateEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Create a campaign",
      input: {
        entityType: "campaign",
        data: {
          Campaigns: [
            {
              Name: "My Campaign",
              BudgetType: "DailyBudgetStandard",
              DailyBudget: 50.0,
              TimeZone: "EasternTimeUSCanada",
            },
          ],
        },
      },
    },
  ],
  logic: createEntityLogic,
  responseFormatter: createEntityResponseFormatter,
};
