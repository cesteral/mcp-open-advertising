// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
import { getEntityTypeEnum, type SnapchatEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext, CesteralReadToolAnnotations } from "@cesteral/shared";

const TOOL_NAME = "snapchat_get_entity";
const TOOL_TITLE = "Get Snapchat Ads Entity";
const TOOL_DESCRIPTION = `Get a single Snapchat Ads entity by ID.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}`;

export const GetEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to retrieve"),
    adAccountId: z.string().min(1).describe("Snapchat Advertiser ID"),
    entityId: z.string().min(1).describe("The entity ID to retrieve"),
  })
  .describe("Parameters for getting a Snapchat Ads entity");

export const GetEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Retrieved entity data"),
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
  const { snapchatService, boundAdAccountId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.adAccountId, boundAdAccountId, "adAccountId");

  const entity = await snapchatService.getEntity(
    input.entityType as SnapchatEntityType,
    input.entityId,
    context
  );

  return {
    entity: entity as unknown as Record<string, unknown>,
    timestamp: new Date().toISOString(),
  };
}

export function getEntityResponseFormatter(result: GetEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Entity retrieved\n${JSON.stringify(result.entity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
      platform: "snapchat",
      contractPlatformSlug: "snapchat",
      contractToolSlug: "get_entity",
      // Mirror `snapchat_update_entity`'s governed entity coverage so a write
      // tool declaring this as its read partner can capture pre/post
      // snapshots. Governed scope is campaign / ad_group / ad; creative has no
      // canonical kind and is out of scope.
      entityKinds: ["campaign", "ad_group", "ad"],
      entityIdArgs: ["entityId"],
      schemaVersion: 1,
      contractId: "snapchat.get_entity.v1",
    } satisfies CesteralReadToolAnnotations,
  },
  inputExamples: [
    {
      label: "Get a campaign by ID",
      input: {
        entityType: "campaign",
        adAccountId: "1234567890",
        entityId: "1800123456789",
      },
    },
    {
      label: "Get an ad group by ID",
      input: {
        entityType: "adGroup",
        adAccountId: "1234567890",
        entityId: "1700123456789",
      },
    },
  ],
  logic: getEntityLogic,
  responseFormatter: getEntityResponseFormatter,
};
