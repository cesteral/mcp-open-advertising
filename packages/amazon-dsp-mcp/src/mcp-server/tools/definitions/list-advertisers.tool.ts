// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "amazon_dsp_list_advertisers";
const TOOL_TITLE = "List AmazonDsp Advertisers";
const TOOL_DESCRIPTION = `List AmazonDsp advertiser accounts accessible to the authenticated user.

Returns advertiser IDs, names, and account status information.
Use the profile_id from results with other amazon_dsp_* tools.`;

export const ListAdvertisersInputSchema = z
  .object({})
  .describe("Parameters for listing AmazonDsp advertisers");

export const ListAdvertisersOutputSchema = z
  .object({
    advertisers: z.array(z.record(z.any())).describe("List of advertiser accounts"),
    count: z.number().describe("Number of advertisers returned"),
    timestamp: z.string().datetime(),
  })
  .describe("Advertiser list result");

type ListAdvertisersInput = z.infer<typeof ListAdvertisersInputSchema>;
type ListAdvertisersOutput = z.infer<typeof ListAdvertisersOutputSchema>;

export async function listProfilesLogic(
  _input: ListAdvertisersInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListAdvertisersOutput> {
  const { amazonDspService } = resolveSessionServices(sdkContext);

  const result = await amazonDspService.listAdvertisers(0, 100, context);

  const advertisers = result.entities as Record<string, unknown>[];

  return {
    advertisers,
    count: advertisers.length,
    timestamp: new Date().toISOString(),
  };
}

export function listProfilesResponseFormatter(result: ListAdvertisersOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Found ${result.count} advertiser(s)\n${JSON.stringify(result.advertisers, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const listProfilesTool = {
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
  logic: listProfilesLogic,
  responseFormatter: listProfilesResponseFormatter,
};