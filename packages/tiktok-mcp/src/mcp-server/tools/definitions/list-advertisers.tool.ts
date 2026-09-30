// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "tiktok_list_advertisers";
const TOOL_TITLE = "List TikTok Advertisers";
const TOOL_DESCRIPTION = `Get account info for the TikTok advertiser this session is bound to.

Calls TikTok's \`advertiser/info/\` endpoint for the session's advertiser ID and returns its
name, status, currency, timezone and related account details.

TikTok's \`advertiser/info/\` returns info only for the advertiser IDs it is given; it does not
enumerate every advertiser the token can access. Each session is bound to one advertiser
(\`X-TikTok-Advertiser-Id\` / \`TIKTOK_ADVERTISER_ID\`).`;

export const ListAdvertisersInputSchema = z
  .object({})
  .describe("Parameters for listing TikTok advertisers");

export const ListAdvertisersOutputSchema = z
  .object({
    advertisers: z.array(z.record(z.any())).describe("List of advertiser accounts"),
    count: z.number().describe("Number of advertisers returned"),
    timestamp: z.string().datetime(),
  })
  .describe("Advertiser list result");

type ListAdvertisersInput = z.infer<typeof ListAdvertisersInputSchema>;
type ListAdvertisersOutput = z.infer<typeof ListAdvertisersOutputSchema>;

export async function listAdvertisersLogic(
  _input: ListAdvertisersInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListAdvertisersOutput> {
  // account-scope-audit-exempt: the input schema has no advertiser parameter to
  // compare against — the tool only ever reads the session-bound advertiser.
  const { tiktokService, boundAdvertiserId } = resolveSessionServices(sdkContext);

  const result = (await tiktokService.listAdvertisers([boundAdvertiserId], context)) as {
    list?: unknown[];
  };

  const advertisers = (result?.list ?? []) as Record<string, unknown>[];

  return {
    advertisers,
    count: advertisers.length,
    timestamp: new Date().toISOString(),
  };
}

export function listAdvertisersResponseFormatter(result: ListAdvertisersOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Found ${result.count} advertiser(s)\n${JSON.stringify(result.advertisers, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
      label: "Get the session-bound advertiser's account info",
      input: {},
    },
  ],
  logic: listAdvertisersLogic,
  responseFormatter: listAdvertisersResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.advertisers"],
    contentBlocks: [0],
  },
};
