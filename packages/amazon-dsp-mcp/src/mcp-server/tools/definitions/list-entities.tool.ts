import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type AmazonDspEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "amazon_dsp_list_entities";
const TOOL_TITLE = "List AmazonDsp Ads Entities";
const TOOL_DESCRIPTION = `List AmazonDsp Ads entities with optional filtering and page-based pagination.

**Entity Hierarchy:** Advertiser > Campaign > Ad Group > Ad (+ Creatives)

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

All entities are scoped to an advertiser account. Pagination uses \`page\` (1-based) and \`pageSize\`.`;

export const ListEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to list"),
    profileId: z
      .string()
      .min(1)
      .describe("AmazonDsp Advertiser ID"),
    filters: z
      .record(z.unknown())
      .optional()
      .describe("Optional filter criteria (e.g., { status: 'ACTIVE' })"),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .default(1)
      .describe("Page number (1-based, default 1)"),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .default(10)
      .describe("Number of entities per page (default 10, max 1000)"),
  })
  .describe("Parameters for listing AmazonDsp Ads entities");

export const ListEntitiesOutputSchema = z
  .object({
    entities: z.array(z.record(z.any())).describe("List of entities"),
    page: z.number().describe("Current page number"),
    pageSize: z.number().describe("Number of results per page"),
    totalNumber: z.number().describe("Total number of entities"),
    totalPage: z.number().describe("Total number of pages"),
    has_more: z.boolean().describe("Whether more pages are available"),
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
  const { amazonDspService } = resolveSessionServices(sdkContext);

  const result = await amazonDspService.listEntities(
    input.entityType as AmazonDspEntityType,
    input.filters,
    input.page,
    input.pageSize,
    context
  );

  const { pageInfo } = result;

  return {
    entities: result.entities as Record<string, unknown>[],
    page: pageInfo.page,
    pageSize: pageInfo.page_size,
    totalNumber: pageInfo.total_number,
    totalPage: pageInfo.total_page,
    has_more: pageInfo.page < pageInfo.total_page,
    timestamp: new Date().toISOString(),
  };
}

export function listEntitiesResponseFormatter(result: ListEntitiesOutput): McpTextContent[] {
  const summary = `Found ${result.entities.length} entities (page ${result.page}/${result.totalPage}, total ${result.totalNumber})`;
  const pagination = result.has_more
    ? `\n\nMore results available. Use page: ${result.page + 1}`
    : "";
  const entities =
    result.entities.length > 0
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
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "List active campaigns",
      input: {
        entityType: "campaign",
        profileId: "1234567890",
        filters: { status: "CAMPAIGN_STATUS_ENABLE" },
        page: 1,
        pageSize: 10,
      },
    },
    {
      label: "List ad groups",
      input: {
        entityType: "adGroup",
        profileId: "1234567890",
      },
    },
  ],
  logic: listEntitiesLogic,
  responseFormatter: listEntitiesResponseFormatter,
};
