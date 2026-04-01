// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_get_context";
const TOOL_TITLE = "TTD Get Context";
const TOOL_DESCRIPTION = `Returns the TTD partner IDs and names accessible with the current credentials.

**Call this tool first** when you do not yet know a \`partnerId\`. The response lists every partner the authenticated account can access — pass the \`id\` field as \`partnerId\` to \`ttd_list_entities\` (entityType: "advertiser") to start exploring the account hierarchy.

This is a zero-argument cold-start tool. It requires no prior knowledge of the account.

### Typical workflow
1. \`ttd_get_context\` → get partner IDs
2. \`ttd_list_entities\` (entityType: advertiser, partnerId: "...") → list advertisers
3. \`ttd_list_entities\` (entityType: campaign, advertiserId: "...") → list campaigns`;

export const GetContextInputSchema = z
  .object({})
  .describe("No inputs required");

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

const PARTNERS_QUERY = `{ partners { nodes { id name } } }`;

export async function getContextLogic(
  _input: GetContextInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetContextOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const result = (await ttdService.graphqlQuery(
    PARTNERS_QUERY,
    undefined,
    context
  )) as Record<string, unknown>;

  const data = (result.data as Record<string, unknown> | undefined) ?? result;
  const partners = (
    (data.partners as Record<string, unknown> | undefined)?.nodes as Array<{
      id: string;
      name: string;
    }>
  ) ?? [];

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

  const lines = result.partners
    .map((p) => `- ${p.name} (id: \`${p.id}\`)`)
    .join("\n");

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
};
