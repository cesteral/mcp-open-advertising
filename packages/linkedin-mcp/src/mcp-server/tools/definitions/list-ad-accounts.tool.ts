import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "linkedin_list_ad_accounts";
const TOOL_TITLE = "List LinkedIn Ad Accounts";
const TOOL_DESCRIPTION = `List LinkedIn Ads accounts accessible to the authenticated user.

Returns ad accounts with their URNs, names, status, and currency.
Use the returned URNs as \`adAccountUrn\` in other tools.`;

export const ListAdAccountsInputSchema = z
  .object({
    start: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Offset for pagination (default 0)"),
    count: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Number of accounts per page (default 25, max 100)"),
  })
  .describe("Parameters for listing LinkedIn ad accounts");

export const ListAdAccountsOutputSchema = z
  .object({
    accounts: z.array(z.record(z.any())).describe("List of ad accounts"),
    total: z.number().optional().describe("Total number of accounts"),
    hasMore: z.boolean().describe("Whether more accounts are available"),
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

  const result = await linkedInService.listAdAccounts(
    input.start,
    input.count,
    context
  );

  const total = result.total;
  const currentStart = input.start ?? 0;
  const pageSize = result.accounts.length;
  const requestedCount = input.count ?? 25;
  const hasMore = total !== undefined
    ? currentStart + pageSize < total
    : pageSize >= requestedCount;

  return {
    accounts: result.accounts as Record<string, unknown>[],
    total,
    hasMore,
    timestamp: new Date().toISOString(),
  };
}

export function listAdAccountsResponseFormatter(result: ListAdAccountsOutput): McpTextContent[] {
  const totalInfo = result.total !== undefined ? ` (total: ${result.total})` : "";
  return [
    {
      type: "text" as const,
      text: `Found ${result.accounts.length} ad accounts${totalInfo}\n\n${JSON.stringify(result.accounts, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
      input: { start: 25, count: 25 },
    },
  ],
  logic: listAdAccountsLogic,
  responseFormatter: listAdAccountsResponseFormatter,
};
