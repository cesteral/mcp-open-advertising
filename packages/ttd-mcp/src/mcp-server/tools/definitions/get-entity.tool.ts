// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type TtdEntityType } from "../utils/entity-mapping.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext, CesteralReadToolAnnotations } from "@cesteral/shared";

const TOOL_NAME = "ttd_get_entity";
const TOOL_TITLE = "Get TTD Entity";
const TOOL_DESCRIPTION = `Get a single The Trade Desk entity by ID.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}`;

export const GetEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to retrieve"),
    entityId: z.string().min(1).describe("The entity ID to retrieve"),
  })
  .describe("Parameters for getting a TTD entity");

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
  const { ttdService } = resolveSessionServices(sdkContext);

  const entity = await ttdService.getEntity(
    input.entityType as TtdEntityType,
    input.entityId,
    context
  );

  return {
    entity: entity as unknown as Record<string, any>,
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
    destructiveHint: false,
    idempotentHint: true,
    cesteral: {
      kind: "read",
      platform: "ttd",
      contractPlatformSlug: "ttd",
      contractToolSlug: "get_entity",
      // Mirror `ttd_update_entity`'s governed entity coverage so a write tool
      // declaring this as its read partner can capture pre/post snapshots.
      // Governed scope is campaign / ad_group; advertiser / creative /
      // conversionTracker have no canonical kind and are out of scope.
      entityKinds: ["campaign", "ad_group"],
      entityIdArgs: ["entityId"],
      schemaVersion: 1,
      contractId: "ttd.get_entity.v1",
    } satisfies CesteralReadToolAnnotations,
  },
  inputExamples: [
    {
      label: "Get a campaign by ID",
      input: {
        entityType: "campaign",
        entityId: "camp456def",
      },
    },
    {
      label: "Get an ad group by ID",
      input: {
        entityType: "adGroup",
        entityId: "adg111aaa",
      },
    },
    {
      label: "Get an advertiser by ID",
      input: {
        entityType: "advertiser",
        entityId: "adv123abc",
      },
    },
  ],
  logic: getEntityLogic,
  responseFormatter: getEntityResponseFormatter,
};
