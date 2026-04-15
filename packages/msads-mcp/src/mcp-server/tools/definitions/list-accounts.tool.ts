// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_list_accounts";
const TOOL_TITLE = "List Microsoft Ads Accounts";
const TOOL_DESCRIPTION = `List accessible Microsoft Advertising accounts for the authenticated user.

Uses the Customer Management API SearchAccounts operation.

Microsoft Advertising requires at least one predicate for SearchAccounts.`;

const PredicateSchema = z.object({
  Field: z.string().min(1).describe("SearchAccounts field name, e.g. UserId or AccountLifeCycleStatus"),
  Operator: z.string().min(1).describe("Predicate operator, e.g. Equals"),
  Value: z.string().min(1).describe("Predicate value"),
});

export const ListAccountsInputSchema = z
  .object({
    predicates: z
      .array(PredicateSchema)
      .min(1)
      .max(2)
      .describe("One SearchAccounts predicate, or two when filtering by AccountLifeCycleStatus plus another field such as UserId"),
  })
  .refine(
    ({ predicates }) =>
      predicates.length === 1 ||
      predicates.some((predicate) => predicate.Field === "AccountLifeCycleStatus"),
    {
      message: "A second predicate is only valid when one predicate uses Field='AccountLifeCycleStatus'",
      path: ["predicates"],
    }
  )
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
  const { msadsCustomerService } = resolveSessionServices(sdkContext);

  const result = (await msadsCustomerService.executeReadOperation(
    "/Accounts/Search",
    {
      Predicates: input.predicates,
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
      label: "List accounts for a user",
      input: {
        predicates: [{ Field: "UserId", Operator: "Equals", Value: "123456" }],
      },
    },
  ],
  logic: listAccountsLogic,
  responseFormatter: listAccountsResponseFormatter,
};
