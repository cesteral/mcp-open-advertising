// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
import { getEntityTypeEnum, type AmazonDspEntityType } from "../utils/entity-mapping.js";
import { AccountIdSchema } from "../utils/account-id.js";
import {
  PaginationOutputSchema,
  buildPaginationOutput,
  formatPaginationHint,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "amazon_dsp_list_entities";
const TOOL_TITLE = "List AmazonDsp Ads Entities";
const TOOL_DESCRIPTION = `List Amazon DSP entities via the Amazon Ads Unified API (\`POST /adsApi/v1/query/{campaigns|adGroups|ads|targets|adAssociations}\`), with optional filters and cursor pagination.

**Entity Hierarchy:** Advertiser account > Order (campaign) > Line Item (ad group) > Target / Creative Association (ad association) > Creative (ad)

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Every query is scoped to \`accountId\` (the \`Amazon-Ads-AccountId\` header). Pagination uses \`nextToken\` from the previous page and \`pageSize\` (sent as \`maxResults\`).

**Filters** (\`{ key: "id1,id2" }\`, comma-separated values allowed):
- order: \`campaignId\`, \`state\`
- lineItem: \`campaignId\` (or legacy \`orderId\`), \`adGroupId\`, \`state\`
- creative: \`adId\` only — list an ad group's ads through creativeAssociation
- target: \`adGroupId\` (or legacy \`lineItemId\`), \`state\`, \`targetType\`
- creativeAssociation: \`adGroupId\` (or \`lineItemId\`), \`adId\` (or \`creativeId\`), \`adAssociationId\``;

export const ListEntitiesInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entities to list"),
    profileId: z.string().min(1).describe("Amazon Ads profile ID bound to this session"),
    accountId: AccountIdSchema,
    filters: z
      .record(z.string())
      .optional()
      .describe(
        "Optional filters, mapped to Unified `{ include: [...] }` query filters (e.g. { campaignId: '581234567890123', state: 'ENABLED,PAUSED' })"
      ),
    nextToken: z
      .string()
      .optional()
      .describe("Cursor from the previous page's `pagination.nextCursor`; omit for the first page"),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(25)
      .describe("Entities per page, sent as `maxResults` (default 25, max 100)"),
  })
  .describe("Parameters for listing Amazon DSP entities");

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
  const { amazonDspService, boundProfileId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.profileId, boundProfileId, "profileId");

  const page = await amazonDspService.listEntities(
    input.entityType as AmazonDspEntityType,
    input.accountId,
    { filters: input.filters, maxResults: input.pageSize, nextToken: input.nextToken },
    context
  );

  return {
    entities: page.entities,
    pagination: buildPaginationOutput({
      nextCursor: page.nextToken ?? null,
      pageSize: page.entities.length,
      nextPageInputKey: "nextToken",
    }),
    timestamp: new Date().toISOString(),
  };
}

export function listEntitiesResponseFormatter(result: ListEntitiesOutput): McpTextContent[] {
  const { pageSize, totalCount } = result.pagination;
  const summary = `Found ${pageSize} entities${
    totalCount !== undefined ? ` (total ${totalCount})` : ""
  }`;
  const entities =
    pageSize > 0
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
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "List enabled and paused orders (campaigns)",
      input: {
        entityType: "order",
        profileId: "1234567890",
        accountId: "5550001112223",
        filters: { state: "ENABLED,PAUSED" },
        pageSize: 25,
      },
    },
    {
      label: "List line items (ad groups) for a campaign",
      input: {
        entityType: "lineItem",
        profileId: "1234567890",
        accountId: "5550001112223",
        filters: { campaignId: "581234567890123" },
      },
    },
  ],
  logic: listEntitiesLogic,
  responseFormatter: listEntitiesResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.entities"],
    contentBlocks: [0],
  },
};
