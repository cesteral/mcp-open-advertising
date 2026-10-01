// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { JsonRpcErrorCode, McpError } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";
import { toFacetUrn } from "../../../services/linkedin/targeting-facets.js";
import type { LinkedInTargetingEntitiesQuery } from "../../../services/linkedin/linkedin-service.js";

const TOOL_NAME = "linkedin_search_targeting";
const TOOL_TITLE = "Search LinkedIn Ads Targeting Entities";
const TOOL_DESCRIPTION = `Find the values inside a LinkedIn targeting facet — the URNs to put in targetingCriteria.

Uses LinkedIn's adTargetingEntities API. The finder is chosen from your arguments:
- \`facet\` alone → every value of the facet (e.g. facet "seniorities")
- \`facet\` + \`query\` → search within the facet (typeahead, e.g. facet "industries", query "software")
- \`facet\` + \`entities\` → values similar to the given ones (e.g. employers like urn:li:organization:1003)
- \`urns\` alone → resolve value URNs to names (no facet)

\`facet\` is a camelCase facet name ("locations", "skills", "titles", …) or its URN. Not every facet supports every finder: locations, profileLocations, schools and the employers/groups facets are search-only; seniorities, genders, ageRanges and a few others are browse-only. List the facets and their finders with linkedin_get_targeting_options.

LinkedIn documents no paging for these finders, so a browse of a large facet (skills, titles) returns everything; this tool returns the first \`limit\` and says when it cut the list — prefer a \`query\`.`;

const FINDER_VALUES = ["adTargetingFacet", "typeahead", "similarEntities", "urns"] as const;

const ENTITY_TYPES = [
  "AGE",
  "COMPANY",
  "COMPANY_SIZE",
  "DEGREE",
  "FIELD_OF_STUDY",
  "FUNCTION",
  "GENDER",
  "GROUP",
  "INDUSTRY",
  "INTEREST",
  "LOCALE",
  "SCHOOL",
  "SENIORITY",
  "SKILL",
  "TITLE",
  "YEARS_OF_EXPERIENCE",
  "MEMBER_BEHAVIOR",
] as const;

export const SearchTargetingInputSchema = z
  .object({
    facet: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Facet name (e.g. "industries") or URN (urn:li:adTargetingFacet:industries). Not used with `urns`.'
      ),
    query: z.string().min(1).optional().describe("Partial text to search for within the facet."),
    entities: z
      .array(z.string().min(1))
      .min(1)
      .optional()
      .describe("Value URNs to find similar values for (e.g. urn:li:organization:1003)."),
    urns: z
      .array(z.string().min(1))
      .min(1)
      .optional()
      .describe("Value URNs to resolve to names (e.g. urn:li:geo:102095887). Takes no facet."),
    entityType: z
      .enum(ENTITY_TYPES)
      .optional()
      .describe("Restrict a search or similar-entities request to one entity type."),
    locale: z
      .object({
        language: z
          .string()
          .regex(/^[a-z]{2}$/)
          .describe("Lowercase ISO-639 code, e.g. en"),
        country: z
          .string()
          .regex(/^[A-Z]{2}$/)
          .describe("Uppercase ISO-3166 code, e.g. US"),
      })
      .optional()
      .describe("Language of the returned names. LinkedIn defaults to en/US."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe(
        "Most values to return (default 100). LinkedIn has no paging; this cuts the response."
      ),
  })
  .superRefine((input, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (input.urns) {
      if (input.facet) issue("`facet` is not used with `urns`; the urns finder takes only URNs.");
      if (input.query || input.entities)
        issue("`urns` cannot be combined with `query` or `entities`.");
      if (input.entityType) issue("`entityType` does not apply to `urns`.");
      return;
    }
    if (!input.facet) issue("`facet` is required unless you pass `urns`.");
    if (input.query && input.entities) issue("Pass either `query` or `entities`, not both.");
    if (input.entityType && !input.query && !input.entities) {
      issue(
        "`entityType` only applies to a search (`query`) or a similar-entities (`entities`) request."
      );
    }
  })
  .describe("Parameters for finding LinkedIn targeting entities");

export const SearchTargetingOutputSchema = z
  .object({
    finder: z.enum(FINDER_VALUES),
    facet: z.string().optional().describe("Facet URN searched; absent for a urns lookup"),
    elements: z.array(z.record(z.any())),
    returned: z.number().int(),
    totalFromLinkedIn: z
      .number()
      .int()
      .describe("How many LinkedIn returned before `limit` cut the list"),
    truncated: z.boolean(),
    timestamp: z.string().datetime(),
  })
  .describe("Targeting entities result");

type SearchTargetingInput = z.infer<typeof SearchTargetingInputSchema>;
type SearchTargetingOutput = z.infer<typeof SearchTargetingOutputSchema>;

const DEFAULT_LIMIT = 100;

function buildQuery(input: SearchTargetingInput): LinkedInTargetingEntitiesQuery {
  const locale = input.locale ? { locale: input.locale } : {};
  const entityType = input.entityType ? { entityType: input.entityType } : {};
  if (input.urns) return { finder: "urns", urns: input.urns, ...locale };
  // The input schema refuses a missing facet and a query combined with entities; this
  // is for callers that reach the logic without it.
  const facet = input.facet;
  if (!facet) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      "`facet` is required unless you pass `urns`."
    );
  }
  if (input.query)
    return { finder: "typeahead", facet, query: input.query, ...entityType, ...locale };
  if (input.entities) {
    return { finder: "similarEntities", facet, entities: input.entities, ...entityType, ...locale };
  }
  return { finder: "adTargetingFacet", facet, ...locale };
}

export async function searchTargetingLogic(
  input: SearchTargetingInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<SearchTargetingOutput> {
  const { linkedInService } = resolveSessionServices(sdkContext);

  const query = buildQuery(input);
  const result = (await linkedInService.getTargetingEntities(query, context)) as {
    elements?: unknown[];
  };

  const all = (result.elements ?? []) as Record<string, unknown>[];
  const elements = all.slice(0, input.limit ?? DEFAULT_LIMIT);

  return {
    finder: query.finder,
    ...(query.finder !== "urns" && { facet: toFacetUrn(query.facet) }),
    elements,
    returned: elements.length,
    totalFromLinkedIn: all.length,
    truncated: all.length > elements.length,
    timestamp: new Date().toISOString(),
  };
}

export function searchTargetingResponseFormatter(result: SearchTargetingOutput): McpTextContent[] {
  const where = result.facet ? ` in ${result.facet}` : "";
  const count = result.truncated
    ? `${result.returned} of ${result.totalFromLinkedIn} (cut by limit — add a \`query\` to narrow)`
    : `${result.returned}`;
  return [
    {
      type: "text" as const,
      text: `Targeting entities${where} (${result.finder}): ${count}\n\n${JSON.stringify(result.elements, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const searchTargetingTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: SearchTargetingInputSchema,
  outputSchema: SearchTargetingOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Search industries",
      input: { facet: "industries", query: "software", limit: 20 },
    },
    {
      label: "Find a location",
      input: { facet: "locations", query: "United Kingdom" },
    },
    {
      label: "Browse seniority levels",
      input: { facet: "seniorities" },
    },
    {
      label: "Find employers similar to one",
      input: { facet: "employers", entities: ["urn:li:organization:1003"] },
    },
    {
      label: "Resolve value URNs to names",
      input: { urns: ["urn:li:geo:102095887", "urn:li:seniority:9"] },
    },
  ],
  logic: searchTargetingLogic,
  responseFormatter: searchTargetingResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.elements"],
    contentBlocks: [0],
  },
};
