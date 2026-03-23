// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "snapchat_list_ad_accounts";
const TOOL_TITLE = "List Snapchat Advertisers";
const TOOL_DESCRIPTION = `List Snapchat advertiser accounts accessible to the authenticated user.

Returns advertiser IDs, names, and account status information.
Use the ad_account_id from results with other snapchat_* tools.

**Requires:** \`X-Snapchat-Org-Id\` header at session connect (or \`SNAPCHAT_ORG_ID\` env var for stdio mode).
The organization ID scopes which ad accounts are returned.`;

export const ListAdvertisersInputSchema = z
  .object({})
  .describe("Parameters for listing Snapchat advertisers");

export const ListAdvertisersOutputSchema = z
  .object({
    advertisers: z.array(z.record(z.any())).describe("List of advertiser accounts"),
    count: z.number().describe("Number of advertisers returned"),
    timestamp: z.string().datetime(),
  })
  .describe("Advertiser list result");

type ListAdvertisersInput = z.infer<typeof ListAdvertisersInputSchema>;
type ListAdvertisersOutput = z.infer<typeof ListAdvertisersOutputSchema>;

export async function listAdAccountsLogic(
  _input: ListAdvertisersInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListAdvertisersOutput> {
  const { snapchatService } = resolveSessionServices(sdkContext);

  const result = await snapchatService.listAdAccounts(context);
  const advertisers = result.entities as unknown as Record<string, unknown>[];

  return {
    advertisers,
    count: advertisers.length,
    timestamp: new Date().toISOString(),
  };
}

export function listAdAccountsResponseFormatter(result: ListAdvertisersOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Found ${result.count} advertiser(s)\n${JSON.stringify(result.advertisers, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
  ],
  logic: listAdAccountsLogic,
  responseFormatter: listAdAccountsResponseFormatter,
};