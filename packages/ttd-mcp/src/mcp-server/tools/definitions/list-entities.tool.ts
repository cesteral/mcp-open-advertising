import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type TtdEntityType } from "../utils/entity-mapping.js";
import type { RequestContext } from "../../../utils/internal/request-context.js";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "ttd_list_entities";
const TOOL_TITLE = "List TTD Entities";
const TOOL_DESCRIPTION = `List The Trade Desk entities with optional filtering and pagination.

**Entity Hierarchy:** partner > advertiser > campaign > adGroup > ad

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Uses TTD API v3 query endpoints. Results are paginated; use pageToken to fetch subsequent pages.`;

export const ListEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to list"),
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID (required for campaigns, ad groups, ads)"),
    campaignId: z
      .string()
      .optional()
      .describe("Campaign ID (optional filter)"),
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
  .describe("Parameters for listing TTD entities");

export const ListEntitiesOutputSchema = z
  .object({
    entities: z.array(z.record(z.any())).describe("List of entities"),
    nextPageToken: z.string().optional().describe("Token for next page"),
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
  logic: listEntitiesLogic,
  responseFormatter: listEntitiesResponseFormatter,
};
