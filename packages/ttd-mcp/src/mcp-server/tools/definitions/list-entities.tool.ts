import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type TtdEntityType } from "../utils/entity-mapping.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "ttd_list_entities";
const TOOL_TITLE = "List TTD Entities";
const TOOL_DESCRIPTION = `List The Trade Desk entities with optional filtering and pagination.

**Entity Hierarchy:** partner > advertiser > campaign > adGroup > ad

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Uses TTD API v3 scoped query endpoints. Required parent IDs depend on entity type:
- **advertiser**: no parent required (scoped to partner)
- **campaign, creative, siteList, deal, conversionTracker, bidList**: \`advertiserId\` required
- **adGroup**: \`advertiserId\` + \`campaignId\` required
- **ad**: \`advertiserId\` + \`adGroupId\` required

Results are paginated; use pageToken to fetch subsequent pages.`;

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
    totalCount: z.number().describe("Number of entities in this page"),
    timestamp: z.string().datetime(),
  })
  .describe("Entity list result");

type ListEntitiesInput = z.infer<typeof ListEntitiesInputSchema>;
type ListEntitiesOutput = z.infer<typeof ListEntitiesOutputSchema>;

export async function listEntitiesLogic(
  input: ListEntitiesInput,
  _context: RequestContext,
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
    _context
  );

  return {
    entities: result.entities as Record<string, any>[],
    nextPageToken: result.nextPageToken,
    has_more: !!result.nextPageToken,
    totalCount: (result.entities as unknown[]).length,
    timestamp: new Date().toISOString(),
  };
}

export function listEntitiesResponseFormatter(result: ListEntitiesOutput): any {
  const summary = `Found ${result.totalCount} entities`;
  const pagination = result.nextPageToken
    ? `\n\nMore results available. Use pageToken: ${result.nextPageToken}`
    : "";
  const entities =
    result.totalCount > 0
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
