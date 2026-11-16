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

const TOOL_NAME = "linkedin_list_ad_accounts";
const TOOL_TITLE = "List LinkedIn Ad Accounts";
const TOOL_DESCRIPTION = `List LinkedIn Ads accounts accessible to the authenticated user.

Returns ad accounts with their URNs, names, status, and currency.
Use the returned URNs as \`adAccountUrn\` in other tools. Pages with a cursor: pass the previous response's \`pagination.nextCursor\` as \`pageToken\`.`;

export const ListAdAccountsInputSchema = z
  .object({
    pageToken: z
      .string()
      .min(1)
      .optional()
      .describe("The cursor from the previous page's pagination.nextCursor"),
    count: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe("Number of accounts per page (default 25, max 1000)"),
  })
  .describe("Parameters for listing LinkedIn ad accounts");

export const ListAdAccountsOutputSchema = z
  .object({
    accounts: z.array(z.record(z.any())).describe("List of ad accounts"),
    pagination: PaginationOutputSchema,
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
  const { linkedInService } = resolveSessionServices(sdkContext);

  const result = await linkedInService.listEntities(
    "adAccount",
    undefined,
    { count: input.count, pageToken: input.pageToken },
    context
  );

  return {
    accounts: result.entities as unknown as Record<string, unknown>[],
    pagination: buildPaginationOutput({
      nextCursor: result.nextPageToken ?? null,
      pageSize: result.entities.length,
      nextPageInputKey: "pageToken",
    }),
    timestamp: new Date().toISOString(),
  };
}

export function listAdAccountsResponseFormatter(result: ListAdAccountsOutput): McpTextContent[] {
  const { pageSize, totalCount } = result.pagination;
  const totalInfo = totalCount !== undefined ? ` (total: ${totalCount})` : "";
  return [
    {
      type: "text" as const,
      text: `Found ${pageSize} ad accounts${totalInfo}\n\n${JSON.stringify(result.accounts, null, 2)}${formatPaginationHint(result.pagination)}\n\nTimestamp: ${result.timestamp}`,
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
      label: "List first 25 ad accounts",
      input: {},
    },
    {
      label: "List next page",
      input: { pageToken: "DgGerr1iVQreCJVjZDOW_grcp63nueBDipsS4DJpvJo", count: 25 },
    },
  ],
  logic: listAdAccountsLogic,
  responseFormatter: listAdAccountsResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.accounts"],
    contentBlocks: [0],
  },
};
