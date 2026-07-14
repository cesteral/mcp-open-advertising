// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  PaginationOutputSchema,
  buildPaginationOutput,
  formatPaginationHint,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "snapchat_list_ad_accounts";
const TOOL_TITLE = "List Snapchat Advertisers";
const TOOL_DESCRIPTION = `List Snapchat advertiser accounts accessible to the authenticated user.

Returns advertiser IDs, names, and account status information.
Use the ad_account_id from results with other snapchat_* tools.

**Requires:** \`X-Snapchat-Org-Id\` header at session connect (or \`SNAPCHAT_ORG_ID\` env var for stdio mode).
The organization ID scopes which ad accounts are returned.

Snapchat paginates with an opaque \`cursor\`. When the response's \`pagination.nextCursor\` is
non-null, call again with \`cursor\` set to it to fetch the next page.`;

export const ListAdAccountsInputSchema = z
  .object({
    cursor: z
      .string()
      .optional()
      .describe("Opaque pagination cursor from a previous response's `pagination.nextCursor`."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Number of advertisers per page (max 100)."),
  })
  .describe("Parameters for listing Snapchat advertisers");

export const ListAdAccountsOutputSchema = z
  .object({
    advertisers: z.array(z.record(z.any())).describe("List of advertiser accounts"),
    count: z.number().describe("Number of advertisers returned in this page"),
    pagination: PaginationOutputSchema,
    timestamp: z.string().datetime(),
  })
  .describe("Advertiser list result");

type ListAdAccountsInput = z.infer<typeof ListAdAccountsInputSchema>;
type ListAdAccountsOutput = z.infer<typeof ListAdAccountsOutputSchema>;

export async function listAdAccountsLogic(
  input: ListAdAccountsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListAdAccountsOutput> {
  const { snapchatService } = resolveSessionServices(sdkContext);

  const result = await snapchatService.listAdAccounts(
    { cursor: input.cursor, limit: input.limit },
    context
  );
  const advertisers = result.entities as unknown as Record<string, unknown>[];

  return {
    advertisers,
    count: advertisers.length,
    pagination: buildPaginationOutput({
      nextCursor: result.nextCursor ?? null,
      pageSize: advertisers.length,
      nextPageInputKey: "cursor",
    }),
    timestamp: new Date().toISOString(),
  };
}

export function listAdAccountsResponseFormatter(result: ListAdAccountsOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Found ${result.count} advertiser(s)\n${JSON.stringify(result.advertisers, null, 2)}${formatPaginationHint(result.pagination)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const listAdAccountsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ListAdAccountsInputSchema,
  outputSchema: ListAdAccountsOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "List all accessible advertisers",
      input: {},
    },
    {
      label: "Fetch the next page",
      input: { cursor: "https://adsapi.snapchat.com/v1/organizations/org_1/adaccounts?cursor=2" },
    },
  ],
  logic: listAdAccountsLogic,
  responseFormatter: listAdAccountsResponseFormatter,
};
