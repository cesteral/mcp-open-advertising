// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  entityContextReadParams,
  getEntityTypeEnum,
  pickEntityContext,
  refineEntityContext,
  type MsAdsEntityType,
} from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext, CesteralReadToolAnnotations } from "@cesteral/shared";

const TOOL_NAME = "msads_get_entity";
const TOOL_TITLE = "Get Microsoft Ads Entity";
const TOOL_DESCRIPTION = `Retrieve a single Microsoft Advertising entity by its ID.

Returns full entity details for the specified entity type and ID.

Some Microsoft Advertising query operations require parent or account context in
addition to the ID (campaign needs accountId, adGroup needs campaignId, etc.).`;

// Flat object + superRefine, not a discriminated union: a top-level union is
// published to MCP clients as an empty input schema (#228). The per-type
// context requirements live in entity-mapping.ts (`getEntityContextKeys`).
export const GetEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to retrieve"),
    entityId: z.string().min(1).describe("The entity ID to retrieve"),
    accountId: z
      .string()
      .min(1)
      .optional()
      .describe("AccountId. Required for campaign (GetCampaignsByIds) and adExtension"),
    campaignId: z
      .string()
      .min(1)
      .optional()
      .describe("CampaignId. Required for adGroup (GetAdGroupsByIds)"),
    adGroupId: z
      .string()
      .min(1)
      .optional()
      .describe("AdGroupId. Required for ad (GetAdsByIds) and keyword (GetKeywordsByIds)"),
    adExtensionType: z
      .string()
      .min(1)
      .optional()
      .describe("AdExtensionType. Required for adExtension (GetAdExtensionsByIds)"),
    additionalParams: z
      .record(z.unknown())
      .optional()
      .describe("Additional parameters such as ReturnAdditionalFields"),
  })
  .superRefine(refineEntityContext)
  .describe("Parameters for getting a Microsoft Ads entity by ID");

export const GetEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).nullable().describe("Retrieved entity data, or null if not found"),
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

  const entityType = input.entityType as MsAdsEntityType;
  const additionalParams: Record<string, unknown> = {
    ...(input.additionalParams ?? {}),
    ...entityContextReadParams(pickEntityContext(entityType, input)),
  };

  const { entities: rawEntities } = await msadsService.getEntity(
    entityType,
    [input.entityId],
    additionalParams,
    context
  );

  const entity = (rawEntities[0] as unknown as Record<string, unknown>) ?? null;

  return {
    entity,
    entityType: input.entityType,
    timestamp: new Date().toISOString(),
  };
}

export function getEntityResponseFormatter(result: GetEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: result.entity
        ? `Retrieved ${result.entityType} entity\n\n${JSON.stringify(result.entity, null, 2)}\n\nTimestamp: ${result.timestamp}`
        : `No ${result.entityType} entity found\n\nTimestamp: ${result.timestamp}`,
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
    cesteral: {
      kind: "read",
      platform: "msads",
      contractPlatformSlug: "msads",
      contractToolSlug: "get_entity",
      // Mirror `msads_update_entity`'s governed entity coverage so a write tool
      // declaring this as its read partner can capture pre/post snapshots.
      // Governed scope is campaign / adGroup / ad / budget; keyword /
      // adExtension / audience / label have no canonical kind and are out of
      // scope.
      entityKinds: ["campaign", "ad_group", "ad", "campaign_budget"],
      entityIdArgs: ["entityId"],
      schemaVersion: 1,
      contractId: "msads.get_entity.v1",
    } satisfies CesteralReadToolAnnotations,
  },
  inputExamples: [
    {
      label: "Get a campaign by ID",
      input: { entityType: "campaign", entityId: "123456", accountId: "789012" },
    },
    {
      label: "Get a shared budget by ID",
      input: { entityType: "budget", entityId: "555000" },
    },
  ],
  logic: getEntityLogic,
  responseFormatter: getEntityResponseFormatter,
};
