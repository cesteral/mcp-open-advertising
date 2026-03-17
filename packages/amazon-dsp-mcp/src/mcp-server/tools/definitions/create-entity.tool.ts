// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type AmazonDspEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "amazon_dsp_create_entity";
const TOOL_TITLE = "Create AmazonDsp Ads Entity";
const TOOL_DESCRIPTION = `Create a new AmazonDsp Ads entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**Key requirements by entity type:**
- **order**: requires \`name\`, \`advertiserId\`, \`budget\`, \`startDate\`, \`endDate\`
- **lineItem**: requires \`name\`, \`orderId\`, \`budget\`
- **creative**: requires \`name\`, \`advertiserId\`, \`creativeType\` (IMAGE, VIDEO, RICH_MEDIA)

**Gotchas:**
- Budget values are in the advertiser's account currency
- Status values: DELIVERING, PAUSED, ARCHIVED
- Amazon-Advertising-API-Scope header is automatically injected from the session profile ID`;

export const CreateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to create"),
    profileId: z
      .string()
      .min(1)
      .describe("AmazonDsp Advertiser ID"),
    data: z
      .record(z.any())
      .describe("Entity fields as key-value pairs"),
  })
  .describe("Parameters for creating a AmazonDsp Ads entity");

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
  const { amazonDspService } = resolveSessionServices(sdkContext);

  const entity = await amazonDspService.createEntity(
    input.entityType as AmazonDspEntityType,
    input.data,
    context
  );

  return {
    entity: entity as Record<string, unknown>,
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
      label: "Create an order (campaign)",
      input: {
        entityType: "order",
        profileId: "1234567890",
        data: {
          name: "Summer Sale 2026",
          advertiserId: "adv_123",
          budget: 10000,
          startDate: "2026-07-01",
          endDate: "2026-07-31",
        },
      },
    },
    {
      label: "Create a line item (ad group)",
      input: {
        entityType: "lineItem",
        profileId: "1234567890",
        data: {
          name: "US Display — Retargeting",
          orderId: "ord_123456789",
          budget: 2000,
          bidding: { bidPrice: 2.5 },
        },
      },
    },
  ],
  logic: createEntityLogic,
  responseFormatter: createEntityResponseFormatter,
};