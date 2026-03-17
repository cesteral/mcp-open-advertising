// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "meta_list_ad_accounts";
const TOOL_TITLE = "List Meta Ad Accounts";
const TOOL_DESCRIPTION = `List ad accounts accessible to the authenticated user.

Returns account ID (with act_ prefix), name, status, currency, timezone, and spend.
Use this to discover available ad accounts before performing other operations.`;

export const ListAdAccountsInputSchema = z
  .object({
    fields: z
      .array(z.string())
      .optional()
      .describe("Fields to return (defaults: id, name, account_status, currency, timezone_name, amount_spent, balance)"),
    limit: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe("Number of accounts to return"),
    after: z
      .string()
      .optional()
      .describe("Pagination cursor — pass nextCursor from a previous response to get the next page"),
  })
  .describe("Parameters for listing ad accounts");

export const ListAdAccountsOutputSchema = z
  .object({
    accounts: z.array(z.record(z.any())).describe("List of ad accounts"),
    totalCount: z.number(),
    nextCursor: z.string().optional().describe("Cursor for the next page of results"),
    has_more: z.boolean().describe("Whether more results are available via pagination"),
    timestamp: z.string().datetime(),
  })
  .describe("Ad accounts list result");

type ListAdAccountsInput = z.infer<typeof ListAdAccountsInputSchema>;
type ListAdAccountsOutput = z.infer<typeof ListAdAccountsOutputSchema>;

export async function listAdAccountsLogic(
  input: ListAdAccountsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListAdAccountsOutput> {
  const { metaService } = resolveSessionServices(sdkContext);

  const result = await metaService.listAdAccounts(
    input.fields,
    input.limit,
    input.after,
    context
  );

  return {
    accounts: result.accounts as Record<string, unknown>[],
    totalCount: (result.accounts as unknown[]).length,
    nextCursor: result.nextCursor,
    has_more: !!result.nextCursor,
    timestamp: new Date().toISOString(),
  };
}

export function listAdAccountsResponseFormatter(result: ListAdAccountsOutput): McpTextContent[] {
  const summary = `Found ${result.totalCount} ad account(s)`;
  const accounts =
    result.totalCount > 0
      ? `\n\n${JSON.stringify(result.accounts, null, 2)}`
      : "\n\nNo ad accounts found";
  const pagination = result.nextCursor
    ? `\n\nMore results available — pass after: "${result.nextCursor}" to get the next page`
    : "";

  return [
    {
      type: "text" as const,
      text: `${summary}${accounts}${pagination}\n\nTimestamp: ${result.timestamp}`,
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
      label: "List all accessible ad accounts",
      input: {},
    },
    {
      label: "List accounts with specific fields",
      input: {
        fields: ["id", "name", "account_status", "currency", "amount_spent"],
        limit: 10,
      },
    },
  ],
  logic: listAdAccountsLogic,
  responseFormatter: listAdAccountsResponseFormatter,
};