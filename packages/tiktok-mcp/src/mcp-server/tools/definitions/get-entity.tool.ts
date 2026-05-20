// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type TikTokEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext, CesteralReadToolAnnotations } from "@cesteral/shared";

const TOOL_NAME = "tiktok_get_entity";
const TOOL_TITLE = "Get TikTok Ads Entity";
const TOOL_DESCRIPTION = `Get a single TikTok Ads entity by ID.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}`;

export const GetEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to retrieve"),
    advertiserId: z.string().min(1).describe("TikTok Advertiser ID"),
    entityId: z.string().min(1).describe("The entity ID to retrieve"),
  })
  .describe("Parameters for getting a TikTok Ads entity");

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
  const { tiktokService } = resolveSessionServices(sdkContext);

  const entity = await tiktokService.getEntity(
    input.entityType as TikTokEntityType,
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
      platform: "tiktok",
      contractPlatformSlug: "tiktok",
      contractToolSlug: "get_entity",
      // Mirror `tiktok_update_entity`'s governed entity coverage so a write
      // tool declaring this as its read partner can capture pre/post
      // snapshots. Governed scope is campaign / adGroup / ad; creative has no
      // canonical kind and is out of scope.
      entityKinds: ["campaign", "ad_group", "ad"],
      entityIdArgs: ["entityId"],
      schemaVersion: 1,
      contractId: "tiktok.get_entity.v1",
    } satisfies CesteralReadToolAnnotations,
  },
  inputExamples: [
    {
      label: "Get a campaign by ID",
      input: {
        entityType: "campaign",
        advertiserId: "1234567890",
        entityId: "1800123456789",
      },
    },
    {
      label: "Get an ad group by ID",
      input: {
        entityType: "adGroup",
        advertiserId: "1234567890",
        entityId: "1700123456789",
      },
    },
  ],
  logic: getEntityLogic,
  responseFormatter: getEntityResponseFormatter,
};
