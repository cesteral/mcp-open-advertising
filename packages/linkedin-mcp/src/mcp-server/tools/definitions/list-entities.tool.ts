import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  getEntityTypeEnum,
  isAccountScopedEntity,
  type LinkedInEntityType,
} from "../utils/entity-mapping.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "linkedin_list_entities";
const TOOL_TITLE = "List LinkedIn Ads Entities";
const TOOL_DESCRIPTION = `List LinkedIn Ads entities with offset-based pagination. Most entity types require \`adAccountUrn\` for scoping. All LinkedIn IDs are URNs (e.g., \`urn:li:sponsoredAccount:123\`). Use \`start\` offset for subsequent pages.`;

export const ListEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to list"),
    adAccountUrn: z
      .string()
      .optional()
      .describe("Ad Account URN (required for campaignGroup, campaign, creative, conversionRule)"),
    start: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Offset for pagination (default 0)"),
    count: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Number of entities per page (default 25, max 100)"),
  })
  .describe("Parameters for listing LinkedIn Ads entities");

export const ListEntitiesOutputSchema = z
  .object({
    entities: z.array(z.record(z.any())).describe("List of entities"),
    total: z.number().optional().describe("Total number of matching entities"),
    start: z.number().optional().describe("Current offset"),
    hasMore: z.boolean().describe("Whether more results are available"),
    count: z.number().describe("Number of entities in this page"),
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
  const { linkedInService } = resolveSessionServices(sdkContext);

  if (isAccountScopedEntity(input.entityType as LinkedInEntityType) && !input.adAccountUrn) {
    throw new Error(
      `adAccountUrn is required for entityType "${input.entityType}". ` +
      "Use linkedin_list_ad_accounts to find available accounts."
    );
  }

  const result = await linkedInService.listEntities(
    input.entityType as LinkedInEntityType,
    input.adAccountUrn,
    input.start,
    input.count,
    context
  );

  const pageSize = result.entities.length;
  const total = result.total;
  const currentStart = result.start ?? 0;
  const requestedCount = input.count ?? 25;
  const hasMore = total !== undefined
    ? currentStart + pageSize < total
    : pageSize >= requestedCount;

  return {
    entities: result.entities as Record<string, unknown>[],
    total,
    start: currentStart,
    hasMore,
    count: pageSize,
    timestamp: new Date().toISOString(),
  };
}

export function listEntitiesResponseFormatter(result: ListEntitiesOutput): unknown[] {
  const totalInfo = result.total !== undefined ? ` (total: ${result.total})` : "";
  const summary = `Found ${result.count} entities${totalInfo}`;
  const pagination = result.hasMore
    ? `\n\nMore results available. Use start: ${(result.start ?? 0) + result.count}`
    : "";
  const entities =
    result.count > 0
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
      label: "List active campaigns for an ad account",
      input: {
        entityType: "campaign",
        adAccountUrn: "urn:li:sponsoredAccount:123456789",
        count: 25,
      },
    },
    {
      label: "List all campaign groups",
      input: {
        entityType: "campaignGroup",
        adAccountUrn: "urn:li:sponsoredAccount:123456789",
      },
    },
    {
      label: "Paginate through creatives (second page)",
      input: {
        entityType: "creative",
        adAccountUrn: "urn:li:sponsoredAccount:123456789",
        start: 25,
        count: 25,
      },
    },
  ],
  logic: listEntitiesLogic,
  responseFormatter: listEntitiesResponseFormatter,
};
