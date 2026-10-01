// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
import { getGettableEntityTypeEnum, type AmazonDspEntityType } from "../utils/entity-mapping.js";
import { AccountIdSchema } from "../utils/account-id.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext, CesteralReadToolAnnotations } from "@cesteral/shared";

const TOOL_NAME = "amazon_dsp_get_entity";
const TOOL_TITLE = "Get AmazonDsp Ads Entity";
const TOOL_DESCRIPTION = `Get a single Amazon DSP entity by ID via the Amazon Ads Unified API (\`POST /adsApi/v1/query/{campaigns|adGroups|ads|adAssociations}\` filtered to the one ID).

**Supported entity types:** ${getGettableEntityTypeEnum().join(", ")}

Targets cannot be read by ID (the Unified target query has no targetId filter) — list them with \`amazon_dsp_list_entities\` and \`filters.adGroupId\`.`;

export const GetEntityInputSchema = z
  .object({
    entityType: z.enum(getGettableEntityTypeEnum()).describe("Type of entity to retrieve"),
    profileId: z.string().min(1).describe("Amazon Ads profile ID bound to this session"),
    accountId: AccountIdSchema,
    entityId: z
      .string()
      .min(1)
      .describe("The entity ID to retrieve (campaignId / adGroupId / adId / adAssociationId)"),
  })
  .describe("Parameters for getting a AmazonDsp Ads entity");

export const GetEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Retrieved entity as the Unified API returns it"),
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
  const { amazonDspService, boundProfileId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.profileId, boundProfileId, "profileId");

  const entity = await amazonDspService.getEntity(
    input.entityType as AmazonDspEntityType,
    input.accountId,
    input.entityId,
    context
  );

  return {
    entity,
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
      platform: "amazon_dsp",
      contractPlatformSlug: "amazon_dsp",
      contractToolSlug: "get_entity",
      // Mirror `amazon_dsp_update_entity`'s governed entity coverage so a
      // write tool declaring this as its read partner can capture pre/post
      // snapshots. Governed scope is order / lineItem (Unified campaign / ad
      // group); creative / creativeAssociation have no canonical kind and are
      // out of scope, and target cannot be read by ID.
      entityKinds: ["order", "line_item"],
      entityIdArgs: ["entityId"],
      schemaVersion: 1,
      contractId: "amazon_dsp.get_entity.v1",
    } satisfies CesteralReadToolAnnotations,
  },
  inputExamples: [
    {
      label: "Get an order (Unified campaign) by ID",
      input: {
        entityType: "order",
        profileId: "1234567890",
        accountId: "5550001112223",
        entityId: "581234567890123",
      },
    },
    {
      label: "Get a line item (Unified ad group) by ID",
      input: {
        entityType: "lineItem",
        profileId: "1234567890",
        accountId: "5550001112223",
        entityId: "592345678901234",
      },
    },
  ],
  logic: getEntityLogic,
  responseFormatter: getEntityResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.entity"],
    contentBlocks: [0],
  },
};
