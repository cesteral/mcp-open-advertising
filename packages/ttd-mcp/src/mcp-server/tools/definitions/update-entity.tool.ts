// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type TtdEntityType } from "../utils/entity-mapping.js";
import { addParentValidationIssue, mergeParentIdsIntoData } from "../utils/parent-id-validation.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_update_entity";
const TOOL_TITLE = "Update TTD Entity";
const TOOL_DESCRIPTION = `Update an existing The Trade Desk entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Uses TTD API v3 PUT endpoint. Provide the entity ID and a data object with the fields to update.`;

export const UpdateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to update"),
    entityId: z.string().min(1).describe("The entity ID to update"),
    partnerId: z
      .string()
      .optional()
      .describe(
        "Partner ID (optional for advertiser updates; injected as PartnerId in the request body)"
      ),
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID (required for most non-advertiser entities)"),
    campaignId: z.string().optional().describe("Campaign ID (required for adGroup)"),
    adGroupId: z.string().optional().describe("Ad Group ID (required for ad)"),
    data: z.record(z.any()).describe("Entity data fields to update"),
  })
  .superRefine((input, ctx) => {
    addParentValidationIssue(
      ctx,
      input.entityType as TtdEntityType,
      input as Record<string, unknown>,
      input.data
    );
  })
  .describe("Parameters for updating a TTD entity");

export const UpdateEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Updated entity data"),
    timestamp: z.string().datetime(),
  })
  .describe("Entity update result");

type UpdateEntityInput = z.infer<typeof UpdateEntityInputSchema>;
type UpdateEntityOutput = z.infer<typeof UpdateEntityOutputSchema>;

export async function updateEntityLogic(
  input: UpdateEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UpdateEntityOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);
  const data = mergeParentIdsIntoData(input.data, input as Record<string, unknown>);

  const entity = await ttdService.updateEntity(
    input.entityType as TtdEntityType,
    input.entityId,
    data,
    context
  );

  return {
    entity: entity as unknown as Record<string, any>,
    timestamp: new Date().toISOString(),
  };
}

export function updateEntityResponseFormatter(result: UpdateEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Entity updated successfully\n${JSON.stringify(result.entity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const updateEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UpdateEntityInputSchema,
  outputSchema: UpdateEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Update campaign name",
      input: {
        entityType: "campaign",
        entityId: "camp456def",
        advertiserId: "adv123abc",
        data: {
          CampaignName: "Q1 2025 Brand Awareness - Updated",
        },
      },
    },
    {
      label: "Update ad group bid",
      input: {
        entityType: "adGroup",
        entityId: "ag789ghi",
        advertiserId: "adv123abc",
        campaignId: "camp456def",
        data: {
          RTBAttributes: {
            BaseBidCPM: { Amount: 4.25, CurrencyCode: "USD" },
          },
        },
      },
    },
  ],
  logic: updateEntityLogic,
  responseFormatter: updateEntityResponseFormatter,
};
