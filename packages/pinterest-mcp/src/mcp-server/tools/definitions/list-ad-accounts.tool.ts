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

const TOOL_NAME = "pinterest_list_ad_accounts";
const TOOL_TITLE = "List Pinterest Advertisers";
const TOOL_DESCRIPTION = `List Pinterest advertiser accounts accessible to the authenticated user.

Returns advertiser IDs, names, and account status information.
Use the ad_account_id from results with other pinterest_* tools.

Pinterest paginates with an opaque \`bookmark\` cursor (default page size 25). When the
response's \`pagination.nextCursor\` is non-null, call again with \`bookmark\` set to it to
fetch the next page.`;

export const ListAdvertisersInputSchema = z
  .object({
    bookmark: z
      .string()
      .optional()
      .describe("Opaque pagination cursor from a previous response's `pagination.nextCursor`."),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Number of advertisers per page (Pinterest default 25, max 100)."),
  })
  .describe("Parameters for listing Pinterest advertisers");

export const ListAdvertisersOutputSchema = z
  .object({
    advertisers: z.array(z.record(z.any())).describe("List of advertiser accounts"),
    count: z.number().describe("Number of advertisers returned in this page"),
    pagination: PaginationOutputSchema,
    timestamp: z.string().datetime(),
  })
  .describe("Advertiser list result");

type ListAdvertisersInput = z.infer<typeof ListAdvertisersInputSchema>;
type ListAdvertisersOutput = z.infer<typeof ListAdvertisersOutputSchema>;

export async function listAdAccountsLogic(
  input: ListAdvertisersInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListAdvertisersOutput> {
  const { pinterestService } = resolveSessionServices(sdkContext);

  const result = await pinterestService.listAdAccounts(
    { bookmark: input.bookmark, pageSize: input.pageSize },
    context
  );
  const advertisers = result.entities as Record<string, unknown>[];

  return {
    advertisers,
    count: advertisers.length,
    pagination: buildPaginationOutput({
      nextCursor: result.nextCursor ?? null,
      pageSize: advertisers.length,
      nextPageInputKey: "bookmark",
    }),
    timestamp: new Date().toISOString(),
  };
}

export function listAdAccountsResponseFormatter(result: ListAdvertisersOutput): McpTextContent[] {
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
  inputSchema: ListAdvertisersInputSchema,
  outputSchema: ListAdvertisersOutputSchema,
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
      input: { bookmark: "Y2xdMTAw" },
    },
  ],
  logic: listAdAccountsLogic,
  responseFormatter: listAdAccountsResponseFormatter,
};
