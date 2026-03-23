// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type MetaEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "meta_create_entity";
const TOOL_TITLE = "Create Meta Ads Entity";
const TOOL_DESCRIPTION = `Create a new Meta Ads entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

All entities are created under an ad account via POST /act_{id}/{edge}.

**Key requirements by entity type:**
- **campaign**: requires \`name\`, \`objective\` (e.g., OUTCOME_AWARENESS), \`special_ad_categories\` (array, can be empty [])
- **adSet**: requires \`name\`, \`campaign_id\`, \`optimization_goal\`, \`billing_event\`, \`targeting\`, \`status\`
- **ad**: requires \`name\`, \`adset_id\`, \`creative\` (object with creative_id)
- **adCreative**: requires \`name\` and creative content fields (object_story_spec, etc.)
- **customAudience**: requires \`name\`, \`subtype\`

**Gotchas:**
- Budget values are in cents (1000 = $10 USD)
- Campaigns need \`special_ad_categories\` even if empty ([])
- Writes are rate-limited at 3x read cost`;

export const CreateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to create"),
    adAccountId: z
      .string()
      .describe("Ad Account ID (with or without act_ prefix)"),
    data: z
      .record(z.any())
      .describe("Entity fields as key-value pairs"),
  })
  .describe("Parameters for creating a Meta Ads entity");

export const CreateEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Created entity (returns id at minimum)"),
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
  const { metaService } = resolveSessionServices(sdkContext);

  const entity = await metaService.createEntity(
    input.entityType as MetaEntityType,
    input.adAccountId,
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
        adAccountId: "act_123456789",
        data: {
          name: "Summer Sale 2026",
          objective: "OUTCOME_TRAFFIC",
          status: "PAUSED",
          special_ad_categories: [],
        },
      },
    },
    {
      label: "Create an ad set",
      input: {
        entityType: "adSet",
        adAccountId: "act_123456789",
        data: {
          name: "US 25-44 Interest Targeting",
          campaign_id: "23456789012345",
          optimization_goal: "LINK_CLICKS",
          billing_event: "IMPRESSIONS",
          daily_budget: 5000,
          targeting: {
            age_min: 25,
            age_max: 44,
            geo_locations: { countries: ["US"] },
          },
          status: "PAUSED",
        },
      },
    },
  ],
  logic: createEntityLogic,
  responseFormatter: createEntityResponseFormatter,
};