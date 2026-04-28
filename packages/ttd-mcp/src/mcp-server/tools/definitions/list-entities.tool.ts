// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type TtdEntityType } from "../utils/entity-mapping.js";
import {
  PaginationOutputSchema,
  buildPaginationOutput,
  formatPaginationHint,
  DEFAULT_PAGE_SIZE,
} from "@cesteral/shared";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_list_entities";
const TOOL_TITLE = "List TTD Entities";
const TOOL_DESCRIPTION = `List The Trade Desk entities with optional filtering and pagination. Required scope IDs: advertiser (partnerId), campaign/creative/conversionTracker (advertiserId), adGroup (advertiserId+campaignId). See entity-hierarchy://ttd resource for details.

**Note:** Ads (ad group + creative associations), deals, bid lists, and publisher lists (site lists) have no REST query endpoints in TTD. Use the ttd_graphql_query tool for these entities.`;

export const ListEntitiesInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entities to list"),
    partnerId: z
      .string()
      .optional()
      .describe("Partner ID (required when listing advertiser entities)"),
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID (required for all entity types except advertiser)"),
    campaignId: z.string().optional().describe("Campaign ID (required for adGroup queries)"),
    adGroupId: z.string().optional().describe("Ad Group ID (required for ad queries)"),
    filter: z
      .record(z.unknown())
      .optional()
      .describe("Additional filter fields to pass to the TTD query endpoint"),
    pageToken: z.string().optional().describe("Page token for pagination (start index)"),
    pageSize: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .default(DEFAULT_PAGE_SIZE)
      .describe(`Number of entities to return per page (default ${DEFAULT_PAGE_SIZE})`),
  })
  .superRefine((data, ctx) => {
    if (data.entityType === "advertiser" && !data.partnerId) {
      ctx.addIssue({
        code: "custom",
        message: "partnerId is required when listing advertiser entities",
        path: ["partnerId"],
      });
    }
    const needsAdvertiser = ["campaign", "adGroup", "creative", "conversionTracker"];
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
        message:
          "campaignId is required when listing adGroup entities (query is scoped to campaign)",
        path: ["campaignId"],
      });
    }
  })
  .describe("Parameters for listing TTD entities");

export const ListEntitiesOutputSchema = z
  .object({
    entities: z.array(z.record(z.any())).describe("List of entities"),
    pagination: PaginationOutputSchema,
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
  if (input.partnerId) {
    filters.PartnerId = input.partnerId;
  }
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

  const entities = result.entities as unknown as Record<string, any>[];
  return {
    entities,
    pagination: buildPaginationOutput({
      nextCursor: result.nextPageToken,
      pageSize: entities.length,
      nextPageInputKey: "pageToken",
    }),
    timestamp: new Date().toISOString(),
  };
}

export function listEntitiesResponseFormatter(result: ListEntitiesOutput): McpTextContent[] {
  const count = result.pagination.pageSize;
  const summary = `Found ${count} entities`;
  const entities =
    count > 0
      ? `\n\nEntities:\n${JSON.stringify(result.entities, null, 2)}`
      : "\n\nNo entities found";

  return [
    {
      type: "text" as const,
      text: `${summary}${entities}${formatPaginationHint(result.pagination)}\n\nTimestamp: ${result.timestamp}`,
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
        partnerId: "partner123",
        pageSize: 20,
        pageToken: "100",
      },
    },
  ],
  logic: listEntitiesLogic,
  responseFormatter: listEntitiesResponseFormatter,
};
