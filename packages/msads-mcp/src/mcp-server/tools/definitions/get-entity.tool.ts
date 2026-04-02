// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { MsAdsEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_get_entity";
const TOOL_TITLE = "Get Microsoft Ads Entity";
const TOOL_DESCRIPTION = `Retrieve one or more Microsoft Advertising entities by their IDs.

Returns full entity details for the specified entity type and IDs.

Some Microsoft Advertising query operations require parent or account context in addition to the IDs.`;

const BaseGetEntitySchema = {
  entityIds: z
    .array(z.string())
    .min(1)
    .describe("Array of entity IDs to retrieve"),
  additionalParams: z
    .record(z.unknown())
    .optional()
    .describe("Additional parameters such as ReturnAdditionalFields"),
};

export const GetEntityInputSchema = z
  .discriminatedUnion("entityType", [
    z.object({
      entityType: z.literal("campaign"),
      accountId: z.string().describe("AccountId required by GetCampaignsByIds"),
      ...BaseGetEntitySchema,
    }),
    z.object({
      entityType: z.literal("adGroup"),
      campaignId: z.string().describe("CampaignId required by GetAdGroupsByIds"),
      ...BaseGetEntitySchema,
    }),
    z.object({
      entityType: z.literal("ad"),
      adGroupId: z.string().describe("AdGroupId required by GetAdsByIds"),
      ...BaseGetEntitySchema,
    }),
    z.object({
      entityType: z.literal("keyword"),
      adGroupId: z.string().describe("AdGroupId required by GetKeywordsByIds"),
      ...BaseGetEntitySchema,
    }),
    z.object({
      entityType: z.literal("adExtension"),
      accountId: z.string().describe("AccountId required by GetAdExtensionsByIds"),
      adExtensionType: z.string().describe("AdExtensionType required by GetAdExtensionsByIds"),
      ...BaseGetEntitySchema,
    }),
    z.object({
      entityType: z.literal("budget"),
      ...BaseGetEntitySchema,
    }),
    z.object({
      entityType: z.literal("audience"),
      ...BaseGetEntitySchema,
    }),
    z.object({
      entityType: z.literal("label"),
      ...BaseGetEntitySchema,
    }),
  ])
  .describe("Parameters for getting Microsoft Ads entities by ID");

export const GetEntityOutputSchema = z
  .object({
    entities: z.array(z.record(z.any())),
    entityType: z.string(),
    timestamp: z.string().datetime(),
  })
  .describe("Entity retrieval result");

type GetEntityInput = z.infer<typeof GetEntityInputSchema>;
type GetEntityOutput = z.infer<typeof GetEntityOutputSchema>;

export async function getEntityLogic(
  input: GetEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetEntityOutput> {
  const { msadsService } = resolveSessionServices(sdkContext);

  const additionalParams: Record<string, unknown> = {
    ...(input.additionalParams ?? {}),
  };

  if ("accountId" in input) {
    additionalParams.AccountId = Number(input.accountId);
  }
  if ("campaignId" in input) {
    additionalParams.CampaignId = Number(input.campaignId);
  }
  if ("adGroupId" in input) {
    additionalParams.AdGroupId = Number(input.adGroupId);
  }
  if ("adExtensionType" in input) {
    additionalParams.AdExtensionType = input.adExtensionType;
  }

  const { entities: rawEntities } = await msadsService.getEntity(
    input.entityType as MsAdsEntityType,
    input.entityIds,
    additionalParams,
    context
  );

  const entities = rawEntities as unknown as Record<string, unknown>[];

  return {
    entities,
    entityType: input.entityType,
    timestamp: new Date().toISOString(),
  };
}

export function getEntityResponseFormatter(result: GetEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Retrieved ${result.entities.length} ${result.entityType} entities\n\n${JSON.stringify(result.entities, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetEntityInputSchema,
  outputSchema: GetEntityOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Get a campaign by ID",
      input: { entityType: "campaign", entityIds: ["123456"], accountId: "789012" },
    },
  ],
  logic: getEntityLogic,
  responseFormatter: getEntityResponseFormatter,
};
