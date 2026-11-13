// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
import {
  getSmartPlusEntityTypeEnum,
  type SmartPlusEntityType,
} from "../utils/smart-plus-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext, CesteralReadToolAnnotations } from "@cesteral/shared";

const TOOL_NAME = "tiktok_get_smart_plus_entity";
const TOOL_TITLE = "Get TikTok Upgraded Smart+ Entity";
const TOOL_DESCRIPTION = `Get a single TikTok Upgraded Smart+ entity by ID, from \`/smart_plus/{campaign,adgroup,ad}/get/\`.

**Supported entity types:** ${getSmartPlusEntityTypeEnum().join(", ")}

Use this for entities created by \`tiktok_create_smart_plus_entity\`. For an \`ad\`, \`entityId\` is the \`smart_plus_ad_id\`.`;

export const GetSmartPlusEntityInputSchema = z
  .object({
    entityType: z.enum(getSmartPlusEntityTypeEnum()).describe("Type of entity to retrieve"),
    advertiserId: z.string().min(1).describe("TikTok Advertiser ID"),
    entityId: z
      .string()
      .min(1)
      .describe("The campaign_id, adgroup_id or smart_plus_ad_id to retrieve"),
  })
  .describe("Parameters for getting a TikTok Upgraded Smart+ entity");

export const GetSmartPlusEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Retrieved entity data"),
    timestamp: z.string().datetime(),
  })
  .describe("Upgraded Smart+ entity retrieval result");

type GetSmartPlusEntityInput = z.infer<typeof GetSmartPlusEntityInputSchema>;
type GetSmartPlusEntityOutput = z.infer<typeof GetSmartPlusEntityOutputSchema>;

export async function getSmartPlusEntityLogic(
  input: GetSmartPlusEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetSmartPlusEntityOutput> {
  const { tiktokService, boundAdvertiserId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.advertiserId, boundAdvertiserId, "advertiserId");

  const entity = await tiktokService.getSmartPlusEntity(
    input.entityType as SmartPlusEntityType,
    input.entityId,
    context
  );

  return { entity, timestamp: new Date().toISOString() };
}

export function getSmartPlusEntityResponseFormatter(
  result: GetSmartPlusEntityOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Entity retrieved\n${JSON.stringify(result.entity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getSmartPlusEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetSmartPlusEntityInputSchema,
  outputSchema: GetSmartPlusEntityOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
    cesteral: {
      kind: "read",
      platform: "tiktok",
      contractPlatformSlug: "tiktok",
      contractToolSlug: "get_smart_plus_entity",
      // Read partner of the tiktok_*_smart_plus_* write tools.
      entityKinds: ["campaign", "ad_group", "ad"],
      entityIdArgs: ["entityId"],
      schemaVersion: 1,
      contractId: "tiktok.get_smart_plus_entity.v1",
    } satisfies CesteralReadToolAnnotations,
  },
  inputExamples: [
    {
      label: "Get an Upgraded Smart+ campaign",
      input: { entityType: "campaign", advertiserId: "1234567890", entityId: "1800123456789" },
    },
    {
      label: "Get an Upgraded Smart+ ad by smart_plus_ad_id",
      input: { entityType: "ad", advertiserId: "1234567890", entityId: "1900123456789" },
    },
  ],
  logic: getSmartPlusEntityLogic,
  responseFormatter: getSmartPlusEntityResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.entity"],
    contentBlocks: [0],
  },
};
