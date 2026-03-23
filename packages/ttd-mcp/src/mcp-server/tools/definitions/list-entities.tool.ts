// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type TtdEntityType } from "../utils/entity-mapping.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_list_entities";
const TOOL_TITLE = "List TTD Entities";
const TOOL_DESCRIPTION = `List The Trade Desk entities with optional filtering and pagination. Required parent IDs: advertiser (none), campaign/creative/siteList/deal/conversionTracker/bidList (advertiserId), adGroup (advertiserId+campaignId), ad (advertiserId+adGroupId). See entity-hierarchy://ttd resource for details.`;

export const ListEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to list"),
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID (required for all entity types except advertiser)"),
    campaignId: z
      .string()
      .optional()
      .describe("Campaign ID (required for adGroup queries)"),
    adGroupId: z
      .string()
      .optional()
      .describe("Ad Group ID (required for ad queries)"),
    filter: z
      .record(z.unknown())
      .optional()
      .describe("Additional filter fields to pass to the TTD query endpoint"),
    pageToken: z
      .string()
      .optional()
      .describe("Page token for pagination (start index)"),
    pageSize: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe("Number of entities to return per page"),
  })
  .superRefine((data, ctx) => {
    const needsAdvertiser = ["campaign", "adGroup", "ad", "creative", "siteList", "deal", "conversionTracker", "bidList"];
    if (needsAdvertiser.includes(data.entityType) && !data.advertiserId) {
      ctx.addIssue({
        code: "custom",
        message: `advertiserId is required when listing ${data.entityType} entities`,
        path: ["advertiserId"],
      });
    }
    // adGroup queries use /adgroup/query/campaign — campaignId is required
    if (data.entityType === "adGroup" && !data.campaignId) {
      ctx.addIssue({
        code: "custom",
        message: "campaignId is required when listing adGroup entities (query is scoped to campaign)",
        path: ["campaignId"],
      });
    }
    // ad queries use /ad/query/adgroup — adGroupId is required
    if (data.entityType === "ad" && !data.adGroupId) {
      ctx.addIssue({
        code: "custom",
        message: "adGroupId is required when listing ad entities (query is scoped to ad group)",
        path: ["adGroupId"],
      });
    }
  })
  .describe("Parameters for listing TTD entities");

export const ListEntitiesOutputSchema = z
  .object({
    entities: z.array(z.record(z.any())).describe("List of entities"),
    nextPageToken: z.string().optional().describe("Token for next page"),
    has_more: z.boolean().describe("Whether more results are available via pagination"),
    pageCount: z.number().describe("Number of entities in this page"),
    timestamp: z.string().datetime(),
  })
  .describe("Entity list result");

type ListEntitiesInput = z.infer<typeof ListEntitiesInputSchema>;
type ListEntitiesOutput = z.infer<typeof ListEntitiesOutputSchema>;

export async function listEntitiesLogic(
  input: ListEntitiesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListEntitiesOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const filters: Record<string, unknown> = { ...input.filter };
  if (input.advertiserId) {
    filters.AdvertiserId = input.advertiserId;
  }
  if (input.campaignId) {
    filters.CampaignId = input.campaignId;
  }
  if (input.adGroupId) {
    filters.AdGroupId = input.adGroupId;
  }

  const result = await ttdService.listEntities(
    input.entityType as TtdEntityType,
    filters,
    input.pageToken,
    input.pageSize,
    context
  );

  return {
    entities: result.entities as unknown as Record<string, any>[],
    nextPageToken: result.nextPageToken,
    has_more: !!result.nextPageToken,
    pageCount: (result.entities as unknown[]).length,
    timestamp: new Date().toISOString(),
  };
}

export function listEntitiesResponseFormatter(result: ListEntitiesOutput): McpTextContent[] {
  const summary = `Found ${result.pageCount} entities`;
  const pagination = result.nextPageToken
    ? `\n\nMore results available. Use pageToken: ${result.nextPageToken}`
    : "";
  const entities =
    result.pageCount > 0
      ? `\n\nEntities:\n${JSON.stringify(result.entities, null, 2)}`
      : "\n\nNo entities found";

  return [
    {
      type: "text" as const,
      text: `${summary}${entities}${pagination}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const listEntitiesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ListEntitiesInputSchema,
  outputSchema: ListEntitiesOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "List all campaigns for an advertiser",
      input: {
        entityType: "campaign",
        advertiserId: "adv123abc",
        pageSize: 50,
      },
    },
    {
      label: "List ad groups for a specific campaign",
      input: {
        entityType: "adGroup",
        advertiserId: "adv123abc",
        campaignId: "camp456def",
        pageSize: 25,
      },
    },
    {
      label: "List advertisers with pagination",
      input: {
        entityType: "advertiser",
        pageSize: 20,
        pageToken: "100",
      },
    },
  ],
  logic: listEntitiesLogic,
  responseFormatter: listEntitiesResponseFormatter,
};