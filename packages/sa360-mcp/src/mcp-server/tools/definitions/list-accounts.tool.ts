import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "sa360_list_accounts";
const TOOL_TITLE = "List SA360 Accounts";
const TOOL_DESCRIPTION = `List all SA360 customer accounts accessible to the authenticated user.

Returns resource names in the format \`customers/{customerId}\`. Use the customer IDs from this list for all other SA360 tools.`;

export const ListAccountsInputSchema = z
  .object({})
  .describe("No parameters required — returns all accessible accounts");

export const ListAccountsOutputSchema = z
  .object({
    resourceNames: z.array(z.string()).describe("Account resource names (customers/{id})"),
    customerIds: z.array(z.string()).describe("Extracted customer IDs"),
    has_more: z.boolean().describe("Whether more results are available (always false for this endpoint)"),
    timestamp: z.string().datetime(),
  })
  .describe("Accessible accounts list");

type ListAccountsInput = z.infer<typeof ListAccountsInputSchema>;
type ListAccountsOutput = z.infer<typeof ListAccountsOutputSchema>;

export async function listAccountsLogic(
  _input: ListAccountsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListAccountsOutput> {
  const { sa360Service } = resolveSessionServices(sdkContext);

  const result = await sa360Service.listAccessibleCustomers(context);

  const customerIds = result.resourceNames.map((rn) => {
    const parts = rn.split("/");
    return parts[parts.length - 1];
  });

  return {
    resourceNames: result.resourceNames,
    customerIds,
    has_more: false,
    timestamp: new Date().toISOString(),
  };
}

export function listAccountsResponseFormatter(result: ListAccountsOutput): any {
  const lines = result.customerIds.map((id, i) => `  ${i + 1}. ${id} (${result.resourceNames[i]})`);

  return [
    {
      type: "text" as const,
      text: `Found ${result.customerIds.length} accessible account(s):\n${lines.join("\n")}\n\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "List all accessible accounts",
      input: {},
    },
  ],
  logic: listAccountsLogic,
  responseFormatter: listAccountsResponseFormatter,
};
