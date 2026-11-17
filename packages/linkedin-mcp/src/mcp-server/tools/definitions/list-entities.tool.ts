// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  getEntityTypeEnum,
  isAccountScopedEntity,
  type LinkedInEntityType,
} from "../utils/entity-mapping.js";
import {
  PaginationOutputSchema,
  buildPaginationOutput,
  formatPaginationHint,
} from "@cesteral/shared";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "linkedin_list_entities";
const TOOL_TITLE = "List LinkedIn Ads Entities";
const TOOL_DESCRIPTION = `List LinkedIn Ads entities. Every type but adAccount requires \`adAccountUrn\`. All LinkedIn IDs are URNs (e.g., \`urn:li:sponsoredAccount:123\`). Ad accounts, campaign groups, campaigns and creatives page with a cursor: \`count\` is the page size, and the next page is fetched by passing the previous response's \`pagination.nextCursor\` as \`pageToken\`. Conversion rules come back in one response.`;

export const ListEntitiesInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entities to list"),
    adAccountUrn: z
      .string()
      .optional()
      .describe("Ad Account URN (required for campaignGroup, campaign, creative, conversionRule)"),
    pageToken: z
      .string()
      .min(1)
      .optional()
      .describe(
        "The cursor from the previous page's pagination.nextCursor (not for conversionRule)"
      ),
    count: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe("Page size (default 25; max 1000, creatives 100)"),
  })
  .describe("Parameters for listing LinkedIn Ads entities");

export const ListEntitiesOutputSchema = z
  .object({
    entities: z.array(z.record(z.string(), z.any())).describe("List of entities"),
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
  const { linkedInService } = resolveSessionServices(sdkContext);

  if (isAccountScopedEntity(input.entityType as LinkedInEntityType) && !input.adAccountUrn) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `adAccountUrn is required for entityType "${input.entityType}". ` +
        "Use linkedin_list_ad_accounts to find available accounts."
    );
  }

  const result = await linkedInService.listEntities(
    input.entityType as LinkedInEntityType,
    input.adAccountUrn,
    { count: input.count, pageToken: input.pageToken },
    context
  );

  return {
    entities: result.entities as unknown as Record<string, unknown>[],
    // A `none` finder returns everything, so it has no next page to point at.
    pagination: buildPaginationOutput({
      nextCursor: result.nextPageToken ?? null,
      pageSize: result.entities.length,
      nextPageInputKey: "pageToken",
    }),
    timestamp: new Date().toISOString(),
  };
}

export function listEntitiesResponseFormatter(result: ListEntitiesOutput): McpTextContent[] {
  const { pageSize, totalCount } = result.pagination;
  const totalInfo = totalCount !== undefined ? ` (total: ${totalCount})` : "";
  const summary = `Found ${pageSize} entities${totalInfo}`;
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
      label: "Paginate through creatives (next page)",
      input: {
        entityType: "creative",
        adAccountUrn: "urn:li:sponsoredAccount:123456789",
        pageToken: "DgGerr1iVQreCJVjZDOW_grcp63nueBDipsS4DJpvJo",
        count: 25,
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
