// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type TtdEntityType } from "../utils/entity-mapping.js";
import {
  addParentValidationIssue,
  mergeParentIdsIntoData,
} from "../utils/parent-id-validation.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_create_entity";
const TOOL_TITLE = "Create TTD Entity";
const TOOL_DESCRIPTION = `Create a new The Trade Desk entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Provide the entity data as a JSON object. Required fields vary by entity type — refer to TTD API v3 documentation.`;

export const CreateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to create"),
    partnerId: z
      .string()
      .optional()
      .describe("Partner ID (required when creating advertiser entities)"),
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID (required for most non-advertiser entities)"),
    campaignId: z
      .string()
      .optional()
      .describe("Campaign ID (required for adGroup)"),
    adGroupId: z
      .string()
      .optional()
      .describe("Ad Group ID (required for ad)"),
    data: z
      .record(z.any())
      .describe("Entity data to create (fields vary by entity type)"),
  })
  .superRefine((input, ctx) => {
    const topLevelPartnerId = typeof input.partnerId === "string"
      ? input.partnerId.trim()
      : undefined;
    const payloadPartnerId = typeof input.data?.PartnerId === "string"
      ? input.data.PartnerId.trim()
      : undefined;

    if (input.entityType === "advertiser" && !topLevelPartnerId && !payloadPartnerId) {
      ctx.addIssue({
        code: "custom",
        message: "partnerId is required when creating advertiser entities",
        path: ["partnerId"],
      });
    }
    addParentValidationIssue(
      ctx,
      input.entityType as TtdEntityType,
      input as Record<string, unknown>,
      input.data
    );
  })
  .describe("Parameters for creating a TTD entity");

export const CreateEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Created entity data"),
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
  const { ttdService } = resolveSessionServices(sdkContext);

  const data = mergeParentIdsIntoData(input.data, input as Record<string, unknown>);

  const entity = await ttdService.createEntity(
    input.entityType as TtdEntityType,
    data,
    context
  );

  return {
    entity: entity as unknown as Record<string, any>,
    timestamp: new Date().toISOString(),
  };
}

export function createEntityResponseFormatter(result: CreateEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Entity created successfully\n${JSON.stringify(result.entity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: true,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Create an advertiser",
      input: {
        entityType: "advertiser",
        partnerId: "partner123",
        data: {
          AdvertiserName: "Acme Corp",
          CurrencyCode: "USD",
        },
      },
    },
    {
      label: "Create a campaign",
      input: {
        entityType: "campaign",
        advertiserId: "adv123abc",
        data: {
          CampaignName: "Q1 2025 Brand Awareness",
          Budget: { Amount: 50000, CurrencyCode: "USD" },
          StartDate: "2025-01-15T00:00:00Z",
          EndDate: "2025-03-31T23:59:59Z",
          PacingMode: "PaceEvenly",
        },
      },
    },
    {
      label: "Create an ad group under a campaign",
      input: {
        entityType: "adGroup",
        advertiserId: "adv123abc",
        campaignId: "camp456def",
        data: {
          AdGroupName: "Prospecting - Display",
          RTBAttributes: {
            BudgetSettings: { DailyBudget: { Amount: 500, CurrencyCode: "USD" } },
            BaseBidCPM: { Amount: 3.50, CurrencyCode: "USD" },
          },
        },
      },
    },
  ],
  logic: createEntityLogic,
  responseFormatter: createEntityResponseFormatter,
};
