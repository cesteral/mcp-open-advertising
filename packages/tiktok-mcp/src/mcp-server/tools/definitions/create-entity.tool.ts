// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type TikTokEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "tiktok_create_entity";
const TOOL_TITLE = "Create TikTok Ads Entity";
const TOOL_DESCRIPTION = `Create a new TikTok Ads entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**Key requirements by entity type:**
- **campaign**: requires \`campaign_name\`, \`objective_type\` (e.g., TRAFFIC, APP_INSTALLS), \`budget_mode\` (BUDGET_MODE_DAY or BUDGET_MODE_TOTAL), \`budget\`
- **adGroup**: requires \`campaign_id\`, \`adgroup_name\`, \`placement_type\`, \`budget_mode\`, \`budget\`, \`schedule_type\`, \`optimize_goal\`
- **ad**: requires \`adgroup_id\`, \`ad_name\`, \`creative_type\`, creative fields (image_ids or video_id)
- **creative**: requires \`display_name\`, creative content (image_ids or video_id)

**Gotchas:**
- Budget values are in the advertiser's account currency
- All status values use prefix format (e.g., CAMPAIGN_STATUS_ENABLE)
- advertiser_id is automatically injected`;

export const CreateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to create"),
    advertiserId: z
      .string()
      .min(1)
      .describe("TikTok Advertiser ID (informational — the session-bound advertiser from authentication is used for API calls)"),
    data: z
      .record(z.any())
      .describe("Entity fields as key-value pairs"),
  })
  .describe("Parameters for creating a TikTok Ads entity");

export const CreateEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Created entity data (includes entity ID)"),
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
  const { tiktokService } = resolveSessionServices(sdkContext);

  const entity = await tiktokService.createEntity(
    input.entityType as TikTokEntityType,
    input.data,
    context
  );

  return {
    entity: entity as unknown as Record<string, unknown>,
    entityType: input.entityType,
    timestamp: new Date().toISOString(),
  };
}

export function createEntityResponseFormatter(result: CreateEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `${result.entityType} created successfully\n${JSON.stringify(result.entity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: true,
  },
  inputExamples: [
    {
      label: "Create a traffic campaign",
      input: {
        entityType: "campaign",
        advertiserId: "1234567890",
        data: {
          campaign_name: "Summer Sale 2026",
          objective_type: "TRAFFIC",
          budget_mode: "BUDGET_MODE_DAY",
          budget: 100,
        },
      },
    },
    {
      label: "Create an ad group",
      input: {
        entityType: "adGroup",
        advertiserId: "1234567890",
        data: {
          campaign_id: "1800123456789",
          adgroup_name: "US 25-44 Interest Targeting",
          placement_type: "PLACEMENT_TYPE_NORMAL",
          budget_mode: "BUDGET_MODE_DAY",
          budget: 50,
          schedule_type: "SCHEDULE_START_END",
          schedule_start_time: "2026-01-01 00:00:00",
          schedule_end_time: "2026-12-31 23:59:59",
          optimize_goal: "CLICK",
        },
      },
    },
  ],
  logic: createEntityLogic,
  responseFormatter: createEntityResponseFormatter,
};
