import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type MetaEntityType } from "../utils/entity-mapping.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "meta_list_entities";
const TOOL_TITLE = "List Meta Ads Entities";
const TOOL_DESCRIPTION = `List Meta Ads entities with optional filtering and cursor-based pagination.

**Entity Hierarchy:** Ad Account > Campaign > Ad Set > Ad (+ Ad Creatives, Custom Audiences)

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

All entities are scoped to an ad account. Filtering uses Meta's JSON-array format.
Results are cursor-paginated; use \`after\` to fetch subsequent pages.

**Important:** Meta returns no fields by default. Specify \`fields\` or rely on defaults.`;

export const ListEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entities to list"),
    adAccountId: z
      .string()
      .describe("Ad Account ID (with or without act_ prefix)"),
    fields: z
      .array(z.string())
      .optional()
      .describe("Fields to return (defaults to common fields for the entity type)"),
    filtering: z
      .array(z.record(z.unknown()))
      .optional()
      .describe("Meta filtering array, e.g. [{field:'status',operator:'IN',value:['ACTIVE']}]"),
    limit: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe("Number of entities per page (default 25)"),
    after: z
      .string()
      .optional()
      .describe("Cursor for next page of results"),
  })
  .describe("Parameters for listing Meta Ads entities");

export const ListEntitiesOutputSchema = z
  .object({
    entities: z.array(z.record(z.any())).describe("List of entities"),
    nextCursor: z.string().optional().describe("Cursor for next page"),
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
  const { metaService } = resolveSessionServices(sdkContext);

  const result = await metaService.listEntities(
    input.entityType as MetaEntityType,
    input.adAccountId,
    input.fields,
    input.filtering,
    input.limit,
    input.after,
    _context
  );

  return {
    entities: result.entities as Record<string, unknown>[],
    nextCursor: result.nextCursor,
    totalCount: (result.entities as unknown[]).length,
    timestamp: new Date().toISOString(),
  };
}

export function listEntitiesResponseFormatter(result: ListEntitiesOutput): unknown[] {
  const summary = `Found ${result.totalCount} entities`;
  const pagination = result.nextCursor
    ? `\n\nMore results available. Use after: "${result.nextCursor}"`
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
      label: "List active campaigns for an ad account",
      input: {
        entityType: "campaign",
        adAccountId: "act_123456789",
        filtering: [{ field: "status", operator: "IN", value: ["ACTIVE"] }],
        limit: 25,
      },
    },
    {
      label: "List all ad sets",
      input: {
        entityType: "adSet",
        adAccountId: "act_123456789",
      },
    },
    {
      label: "List ad creatives with specific fields",
      input: {
        entityType: "adCreative",
        adAccountId: "act_123456789",
        fields: ["id", "name", "body", "image_url"],
        limit: 50,
      },
    },
  ],
  logic: listEntitiesLogic,
  responseFormatter: listEntitiesResponseFormatter,
};
