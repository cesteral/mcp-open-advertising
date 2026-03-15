// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_list_accounts";
const TOOL_TITLE = "List Microsoft Ads Accounts";
const TOOL_DESCRIPTION = `List accessible Microsoft Advertising accounts for the authenticated user.

Uses the Customer Management API to retrieve account information.`;

export const ListAccountsInputSchema = z
  .object({
    filters: z
      .record(z.unknown())
      .optional()
      .describe("Optional filters for account search"),
  })
  .describe("Parameters for listing Microsoft Ads accounts");

export const ListAccountsOutputSchema = z
  .object({
    accounts: z.array(z.record(z.any())),
    count: z.number(),
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
  const { msadsService } = resolveSessionServices(sdkContext);

  const result = (await msadsService.executeOperation(
    "/Accounts/Search",
    {
      Predicates: input.filters ? [input.filters] : [],
      Ordering: null,
      PageInfo: { Index: 0, Size: 100 },
    },
    context
  )) as Record<string, unknown>;

  const accounts = (result.Accounts as Record<string, unknown>[]) ?? [];

  return {
    accounts,
    count: accounts.length,
    timestamp: new Date().toISOString(),
  };
}

export function listAccountsResponseFormatter(result: ListAccountsOutput): McpTextContent[] {
  const summary = `Found ${result.count} accounts`;
  const accounts =
    result.accounts.length > 0
      ? `\n\n${JSON.stringify(result.accounts, null, 2)}`
      : "\n\nNo accounts found";

  return [
    {
      type: "text" as const,
      text: `${summary}${accounts}\n\nTimestamp: ${result.timestamp}`,
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
  inputExamples: [
    {
      label: "List all accounts",
      input: {},
    },
  ],
  logic: listAccountsLogic,
  responseFormatter: listAccountsResponseFormatter,
};