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
import type { AmazonDspAdvertiserAccount } from "../../../services/amazon-dsp/types.js";

const TOOL_NAME = "amazon_dsp_list_advertisers";
const TOOL_TITLE = "List AmazonDsp Advertisers";
const TOOL_DESCRIPTION = `List the Amazon Ads advertiser accounts the authenticated credentials can access.

Calls \`POST /adsApi/v1/query/advertiserAccounts\` (Amazon deprecated the legacy \`GET /dsp/advertisers\`; it returns HTTP 404 from July 2027).
Each account has an \`advertiserAccountId\` (global \`amzn1.ads-account.g.*\`, or non-global \`amzn1.ads1.aa1.<country>.<entityId>\`) and \`alternateIds\`. The DSP entries of \`alternateIds\` carry \`dspAdvertiserId\` and \`region\` (NA, EU, FE).
Pass a \`dspAdvertiserId\` as \`accountId\` to the entity and reporting tools (it becomes the Unified API's \`Amazon-Ads-AccountId\` header; Amazon's getting-started guide names it as the value for ADSP requests). The \`advertiserAccountId\` is not the DSP advertiser ID, and a global \`amzn1.ads-account.g.*\` ID as \`accountId\` makes Amazon require an ID filter on every entity query. A global account lists one \`dspAdvertiserId\` per region; use the one whose region matches this server's configured Amazon host.

By default Amazon returns **global accounts only**. Set \`isGlobalAccount: false\` to list non-global (single-marketplace) accounts; to see every account, run both.

Pagination is cursor-based: when \`pagination.nextCursor\` is non-null, call again with \`nextToken\` set to it. A page can be empty and still carry a next cursor, so keep going until it is null.`;

export const ListAdvertisersInputSchema = z
  .object({
    isGlobalAccount: z
      .boolean()
      .optional()
      .describe(
        "true = global accounts, false = non-global accounts. Omit for Amazon's default, which is global accounts only."
      ),
    pageSize: z
      .number()
      .int()
      .min(10)
      .max(100)
      .optional()
      .describe(
        "Maximum accounts per page (Amazon's maxResults: 10-100, default 100). A page may hold fewer."
      ),
    nextToken: z
      .string()
      .min(1)
      .optional()
      .describe("Cursor from the previous page's pagination.nextCursor."),
  })
  .describe("Parameters for listing Amazon Ads advertiser accounts");

export const ListAdvertisersOutputSchema = z
  .object({
    advertiserAccounts: z
      .array(z.record(z.string(), z.any()))
      .describe(
        "Advertiser accounts as Amazon returns them (advertiserAccountId, alternateIds, displayName, ...)"
      ),
    count: z.number().describe("Number of accounts returned in this page"),
    pagination: PaginationOutputSchema,
    timestamp: z.string().datetime(),
  })
  .describe("Advertiser account list result");

type ListAdvertisersInput = z.infer<typeof ListAdvertisersInputSchema>;
type ListAdvertisersOutput = z.infer<typeof ListAdvertisersOutputSchema>;

export async function listAdvertisersLogic(
  input: ListAdvertisersInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListAdvertisersOutput> {
  const { amazonDspService } = resolveSessionServices(sdkContext);

  const page = await amazonDspService.listAdvertisers(
    {
      isGlobalAccount: input.isGlobalAccount,
      maxResults: input.pageSize,
      nextToken: input.nextToken,
    },
    context
  );

  return {
    advertiserAccounts: page.accounts as unknown as Record<string, unknown>[],
    count: page.accounts.length,
    pagination: buildPaginationOutput({
      nextCursor: page.nextToken ?? null,
      pageSize: page.accounts.length,
      nextPageInputKey: "nextToken",
    }),
    timestamp: new Date().toISOString(),
  };
}

/** One line per DSP advertiser ID: the value the model passes as `accountId`. */
function dspAdvertiserLines(accounts: AmazonDspAdvertiserAccount[]): string[] {
  const lines: string[] = [];
  for (const account of accounts) {
    for (const alt of account.alternateIds ?? []) {
      if (!alt.dspAdvertiserId) continue;
      const name = account.displayName ? ` — ${account.displayName}` : "";
      lines.push(
        `accountId ${alt.dspAdvertiserId} (region ${alt.region ?? "?"}, ${account.advertiserAccountId})${name}`
      );
    }
  }
  return lines;
}

export function listAdvertisersResponseFormatter(result: ListAdvertisersOutput): McpTextContent[] {
  const lines = dspAdvertiserLines(result.advertiserAccounts as AmazonDspAdvertiserAccount[]);
  const summary = lines.length > 0 ? `\nDSP advertiser IDs:\n${lines.join("\n")}\n` : "";
  return [
    {
      type: "text" as const,
      text: `Found ${result.count} advertiser account(s)\n${summary}\n${JSON.stringify(result.advertiserAccounts, null, 2)}${formatPaginationHint(result.pagination)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const listAdvertisersTool = {
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
      label: "List global advertiser accounts (Amazon's default)",
      input: {},
    },
    {
      label: "List non-global (single-marketplace) accounts",
      input: { isGlobalAccount: false },
    },
    {
      label: "Fetch the next page",
      input: {
        isGlobalAccount: false,
        nextToken: "eyJsYXN0UmV0dXJuZWRWYWx1ZSI6...",
      },
    },
  ],
  logic: listAdvertisersLogic,
  responseFormatter: listAdvertisersResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.advertiserAccounts"],
    contentBlocks: [0],
  },
};
