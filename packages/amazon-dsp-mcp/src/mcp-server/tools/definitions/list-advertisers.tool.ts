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

const TOOL_NAME = "amazon_dsp_list_advertisers";
const TOOL_TITLE = "List AmazonDsp Advertisers";
const TOOL_DESCRIPTION = `List AmazonDsp advertiser accounts accessible to the authenticated user.

Returns advertiser IDs, names, and account status information.
Use the profile_id from results with other amazon_dsp_* tools.

Amazon DSP paginates by offset. When the response's \`pagination.nextCursor\` is non-null,
call again with \`startIndex\` set to it to fetch the next page.`;

export const ListAdvertisersInputSchema = z
  .object({
    startIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Zero-based offset of the first advertiser to return (default 0)."),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Number of advertisers per page (default 25, max 100)."),
  })
  .describe("Parameters for listing AmazonDsp advertisers");

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

export async function listAdvertisersLogic(
  input: ListAdvertisersInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListAdvertisersOutput> {
  const { amazonDspService } = resolveSessionServices(sdkContext);

  const startIndex = input.startIndex ?? 0;
  const pageSize = input.pageSize ?? 25;
  const result = await amazonDspService.listAdvertisers(startIndex, pageSize, context);

  const advertisers = result.entities as unknown as Record<string, unknown>[];
  const totalResults = result.pageInfo.totalResults;
  const nextStart = startIndex + advertisers.length;
  const hasMore = nextStart < totalResults;

  return {
    advertisers,
    count: advertisers.length,
    pagination: buildPaginationOutput({
      nextCursor: hasMore ? String(nextStart) : null,
      pageSize: advertisers.length,
      totalCount: totalResults,
      nextPageInputKey: "startIndex",
    }),
    timestamp: new Date().toISOString(),
  };
}

export function listAdvertisersResponseFormatter(result: ListAdvertisersOutput): McpTextContent[] {
  const { totalCount } = result.pagination;
  const totalInfo = totalCount !== undefined ? ` (total: ${totalCount})` : "";
  return [
    {
      type: "text" as const,
      text: `Found ${result.count} advertiser(s)${totalInfo}\n${JSON.stringify(result.advertisers, null, 2)}${formatPaginationHint(result.pagination)}\n\nTimestamp: ${result.timestamp}`,
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
      label: "List first page of advertisers",
      input: {},
    },
    {
      label: "Fetch the next page",
      input: { startIndex: 25, pageSize: 25 },
    },
  ],
  logic: listAdvertisersLogic,
  responseFormatter: listAdvertisersResponseFormatter,
};
