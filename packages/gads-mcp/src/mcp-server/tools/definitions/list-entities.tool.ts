import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type GAdsEntityType } from "../utils/entity-mapping.js";
import { addParentValidationIssue } from "../utils/parent-id-validation.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "gads_list_entities";
const TOOL_TITLE = "List Google Ads Entities";
const TOOL_DESCRIPTION = `List Google Ads entities of a given type with optional GAQL filters. Filters are applied as GAQL WHERE conditions. For complex queries, use \`gads_gaql_search\` directly.`;

export const ListEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to list"),
    customerId: z
      .string()
      .min(1)
      .describe("Google Ads customer ID (no dashes)"),
    filters: z
      .record(z.string())
      .optional()
      .describe("GAQL filter conditions as field:value pairs (e.g., { 'campaign.status': '= \\'ENABLED\\'' })"),
    pageSize: z
      .number()
      .min(1)
      .max(10000)
      .optional()
      .default(100)
      .describe("Number of results per page (default 100)"),
    pageToken: z
      .string()
      .optional()
      .describe("Page token for pagination"),
    orderBy: z
      .string()
      .optional()
      .describe("GAQL ORDER BY clause (e.g., 'campaign.name ASC')"),
  })
  .superRefine((input, ctx) => {
    addParentValidationIssue(
      ctx,
      input.entityType as GAdsEntityType,
      input as Record<string, unknown>
    );
  })
  .describe("Parameters for listing Google Ads entities");

export const ListEntitiesOutputSchema = z
  .object({
    entities: z.array(z.record(z.any())).describe("List of entities"),
    totalResultsCount: z.number().optional(),
    nextPageToken: z.string().optional(),
    has_more: z.boolean().describe("Whether more results are available via pagination"),
    timestamp: z.string().datetime(),
  })
  .describe("Entity listing result");

type ListEntitiesInput = z.infer<typeof ListEntitiesInputSchema>;
type ListEntitiesOutput = z.infer<typeof ListEntitiesOutputSchema>;

export async function listEntitiesLogic(
  input: ListEntitiesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListEntitiesOutput> {
  const { gadsService } = resolveSessionServices(sdkContext);

  const result = await gadsService.listEntities(
    input.entityType as GAdsEntityType,
    input.customerId,
    input.filters,
    input.pageSize,
    input.pageToken,
    input.orderBy,
    context
  );

  return {
    entities: result.entities as Record<string, any>[],
    totalResultsCount: result.totalResultsCount,
    nextPageToken: result.nextPageToken,
    has_more: !!result.nextPageToken,
    timestamp: new Date().toISOString(),
  };
}

export function listEntitiesResponseFormatter(result: ListEntitiesOutput): McpTextContent[] {
  const summary = `Found ${result.entities.length} entities${
    result.totalResultsCount ? ` (${result.totalResultsCount} total)` : ""
  }${result.nextPageToken ? " — more pages available" : ""}`;

  return [
    {
      type: "text" as const,
      text: `${summary}\n\n${JSON.stringify(result.entities, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
      label: "List all enabled campaigns for a customer",
      input: {
        entityType: "campaign",
        customerId: "1234567890",
        filters: {
          "campaign.status": "= 'ENABLED'",
        },
      },
    },
    {
      label: "List ad groups within a specific campaign",
      input: {
        entityType: "adGroup",
        customerId: "1234567890",
        filters: {
          "ad_group.campaign": "= 'customers/1234567890/campaigns/9876543210'",
        },
        orderBy: "ad_group.name ASC",
      },
    },
    {
      label: "List keywords with pagination",
      input: {
        entityType: "keyword",
        customerId: "1234567890",
        filters: {
          "ad_group_criterion.status": "= 'ENABLED'",
        },
        pageSize: 50,
      },
    },
  ],
  logic: listEntitiesLogic,
  responseFormatter: listEntitiesResponseFormatter,
};
