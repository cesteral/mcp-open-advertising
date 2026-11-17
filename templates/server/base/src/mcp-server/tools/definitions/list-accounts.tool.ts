// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { buildPaginationOutput, PaginationOutputSchema } from "@cesteral/shared";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "{{key}}_list_accounts";
const TOOL_TITLE = "List {{displayName}} Accounts";
const TOOL_DESCRIPTION = `List the {{displayName}} accounts the authenticated user can access.

Use an account's ID as \`accountId\` with the other {{key}}_* tools. Pass \`pagination.nextCursor\` from a response as \`pageToken\` to read the next page.`;

export const ListAccountsInputSchema = z
  .object({
    pageToken: z
      .string()
      .optional()
      .describe("Cursor for the next page (pagination.nextCursor of the previous response)"),
  })
  .describe("Parameters for listing {{displayName}} accounts");

export const ListAccountsOutputSchema = z
  .object({
    accounts: z.array(z.record(z.string(), z.any())).describe("Accessible accounts"),
    pagination: PaginationOutputSchema,
    timestamp: z.string().datetime(),
  })
  .describe("Account list result");

type ListAccountsInput = z.infer<typeof ListAccountsInputSchema>;
type ListAccountsOutput = z.infer<typeof ListAccountsOutputSchema>;

export async function listAccountsLogic(
  input: ListAccountsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListAccountsOutput> {
  const { {{key}}Service } = resolveSessionServices(sdkContext);
  const result = await {{key}}Service.listAccounts(input.pageToken, context);
  return {
    accounts: result.items,
    pagination: buildPaginationOutput({
      nextCursor: result.nextPageToken,
      pageSize: result.items.length,
      nextPageInputKey: "pageToken",
    }),
    timestamp: new Date().toISOString(),
  };
}

export function listAccountsResponseFormatter(result: ListAccountsOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Found ${result.pagination.pageSize} accounts\n\n${JSON.stringify(result.accounts, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const listAccountsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ListAccountsInputSchema,
  outputSchema: ListAccountsOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [{ label: "List accessible accounts", input: {} }],
  logic: listAccountsLogic,
  responseFormatter: listAccountsResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.accounts"],
    contentBlocks: [0],
  },
};
