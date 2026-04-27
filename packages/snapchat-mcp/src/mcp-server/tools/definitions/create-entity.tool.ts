// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type SnapchatEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "snapchat_create_entity";
const TOOL_TITLE = "Create Snapchat Ads Entity";
const TOOL_DESCRIPTION = `Create a new Snapchat Ads entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**Key requirements by entity type:**
- **campaign**: requires \`name\`, \`status\`, and either \`daily_budget_micro\` or \`lifetime_spend_cap_micro\`
- **adGroup**: requires \`campaignId\` + \`name\`, \`status\`, \`type\`, \`placement\`, \`targeting\`, \`optimization_goal\`, and a supported budget field
- **ad**: requires \`adSquadId\` + \`name\`, \`creative_id\`, \`type\`, \`status\`
- **creative**: requires fields matching the chosen creative type, such as \`name\`, \`type\`, \`brand_name\`, \`headline\`, \`call_to_action\`, and media or destination properties

**Parent entity IDs (passed as top-level params, not in data):**
- Creating \`adGroup\`: supply \`campaignId\` (routes to /v1/campaigns/{id}/adsquads)
- Creating \`ad\`: supply \`adSquadId\` (routes to /v1/adsquads/{id}/ads)

**Gotchas:**
- Budget values are in micro-currency (multiply by 1,000,000 — e.g., $10 = 10000000)
- ad_account_id is automatically injected`;

export const CreateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to create"),
    adAccountId: z.string().min(1).describe("Snapchat Advertiser ID"),
    campaignId: z
      .string()
      .optional()
      .describe("Campaign ID — required when entityType is 'adGroup'"),
    adSquadId: z.string().optional().describe("Ad Squad ID — required when entityType is 'ad'"),
    data: z.record(z.any()).describe("Entity fields as key-value pairs"),
  })
  .describe("Parameters for creating a Snapchat Ads entity");

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
  const { snapchatService } = resolveSessionServices(sdkContext);

  const filters: Record<string, string> = { adAccountId: input.adAccountId };
  if (input.campaignId) filters.campaignId = input.campaignId;
  if (input.adSquadId) filters.adSquadId = input.adSquadId;

  const entity = await snapchatService.createEntity(
    input.entityType as SnapchatEntityType,
    filters,
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
        adAccountId: "1234567890",
        data: {
          name: "Summer Sale 2026",
          objective: "WEB_CONVERSION",
          daily_budget_micro: 10000000,
          status: "ACTIVE",
        },
      },
    },
    {
      label: "Create an ad group",
      input: {
        entityType: "adGroup",
        adAccountId: "1234567890",
        campaignId: "1800123456789",
        data: {
          name: "US 25-44 Interest Targeting",
          placement: "SNAP_ADS",
          type: "SNAP_ADS",
          daily_budget_micro: 5000000,
          optimization_goal: "IMPRESSIONS",
          bid_micro: 1000000,
          status: "ACTIVE",
          targeting: {
            geos: [{ country_code: "us" }],
          },
          start_time: "2026-01-01T00:00:00Z",
          end_time: "2026-12-31T23:59:59Z",
        },
      },
    },
  ],
  logic: createEntityLogic,
  responseFormatter: createEntityResponseFormatter,
};
