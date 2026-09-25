// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";
import { throwIfGraphqlErrors } from "../utils/graphql-errors.js";

const TOOL_NAME = "ttd_get_context";
const TOOL_TITLE = "TTD Get Context";
const TOOL_DESCRIPTION = `Returns the TTD partner IDs and names accessible with the current credentials.

**Call this tool first** when you do not yet know a \`partnerId\`. The response lists every partner the authenticated account can access — pass the \`id\` field as \`partnerId\` to \`ttd_list_entities\` (entityType: "advertiser") to start exploring the account hierarchy.

This is a zero-argument cold-start tool. It requires no prior knowledge of the account.

### Typical workflow
1. \`ttd_get_context\` → get partner IDs
2. \`ttd_list_entities\` (entityType: advertiser, partnerId: "...") → list advertisers
3. \`ttd_list_entities\` (entityType: campaign, advertiserId: "...") → list campaigns`;

export const GetContextInputSchema = z.object({}).describe("No inputs required");

export const GetContextOutputSchema = z
  .object({
    partners: z
      .array(
        z.object({
          id: z.string().describe("Partner ID — use as partnerId in ttd_list_entities"),
          name: z.string().describe("Human-readable partner name"),
        })
      )
      .describe("TTD partners accessible with the current credentials"),
    timestamp: z.string().datetime(),
  })
  .describe("TTD account context");

type GetContextInput = z.infer<typeof GetContextInputSchema>;
type GetContextOutput = z.infer<typeof GetContextOutputSchema>;

// TTD GraphQL connections return only the first 10 items unless `first` is set
// (docs/api/thetradedesk_graphql_api_docs.md "Paginate Lists"); `partners`
// takes `first`/`after` (docs/api/ttd-api-reference-part4.md). Page through
// every partner via `pageInfo { hasNextPage endCursor }`.
const PARTNERS_QUERY = `query GetPartners($first: Int, $after: String) {
  partners(first: $first, after: $after) {
    nodes { id name }
    pageInfo { hasNextPage endCursor }
  }
}`;
export const PARTNERS_PAGE_SIZE = 100;
/** Safety cap on round-trips (100 × 100 = 10,000 partners). */
export const PARTNERS_MAX_PAGES = 100;

export async function getContextLogic(
  _input: GetContextInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetContextOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const partners: Array<{ id: string; name: string }> = [];
  let after: string | undefined;
  for (let page = 0; page < PARTNERS_MAX_PAGES; page++) {
    const result = (await ttdService.graphqlQuery(
      PARTNERS_QUERY,
      { first: PARTNERS_PAGE_SIZE, ...(after ? { after } : {}) },
      context
    )) as Record<string, unknown>;

    throwIfGraphqlErrors(result, "GraphQL error fetching partner context");

    const data = (result.data as Record<string, unknown> | undefined) ?? result;
    const connection = data.partners as Record<string, unknown> | undefined;
    const nodes = (connection?.nodes as Array<{ id: string; name: string }> | undefined) ?? [];
    partners.push(...nodes);

    const pageInfo = connection?.pageInfo as
      | { hasNextPage?: boolean; endCursor?: string | null }
      | undefined;
    const nextCursor = pageInfo?.endCursor ?? undefined;
    // Stop when TTD says there is no next page, or when the cursor would not
    // advance (a defensive guard against looping on the same page).
    if (!pageInfo?.hasNextPage || !nextCursor || nextCursor === after) break;
    after = nextCursor;
  }

  return {
    partners,
    timestamp: new Date().toISOString(),
  };
}

export function getContextResponseFormatter(result: GetContextOutput): McpTextContent[] {
  if (result.partners.length === 0) {
    return [
      {
        type: "text" as const,
        text: `No partners found for the current credentials.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  const lines = result.partners.map((p) => `- ${p.name} (id: \`${p.id}\`)`).join("\n");

  return [
    {
      type: "text" as const,
      text:
        `Found ${result.partners.length} partner(s):\n\n${lines}\n\n` +
        `Use one of these IDs as \`partnerId\` when calling \`ttd_list_entities\` (entityType: "advertiser").\n\n` +
        `Timestamp: ${result.timestamp}`,
    },
  ];
}

export const getContextTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetContextInputSchema,
  outputSchema: GetContextOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Get partner IDs to start account discovery",
      input: {},
    },
  ],
  logic: getContextLogic,
  responseFormatter: getContextResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.partners"],
    contentBlocks: [0],
  },
};
