import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "sa360_list_custom_columns";
const TOOL_TITLE = "List SA360 Custom Columns";
const TOOL_DESCRIPTION = `List custom columns defined for an SA360 customer account.

Custom columns are user-defined metrics/dimensions that can be referenced in SA360 queries. Returns column metadata including ID, name, description, and value type.`;

export const ListCustomColumnsInputSchema = z
  .object({
    customerId: z
      .string()
      .min(1)
      .describe("SA360 customer ID (no dashes)"),
  })
  .describe("Parameters for listing custom columns");

export const ListCustomColumnsOutputSchema = z
  .object({
    customColumns: z.array(z.record(z.any())).describe("Custom column definitions"),
    totalCount: z.number().describe("Number of custom columns"),
    timestamp: z.string().datetime(),
  })
  .describe("Custom columns list");

type ListCustomColumnsInput = z.infer<typeof ListCustomColumnsInputSchema>;
type ListCustomColumnsOutput = z.infer<typeof ListCustomColumnsOutputSchema>;

export async function listCustomColumnsLogic(
  input: ListCustomColumnsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListCustomColumnsOutput> {
  const { sa360Service } = resolveSessionServices(sdkContext);

  const result = await sa360Service.listCustomColumns(input.customerId, context);

  return {
    customColumns: result.customColumns as Record<string, any>[],
    totalCount: result.customColumns.length,
    timestamp: new Date().toISOString(),
  };
}

export function listCustomColumnsResponseFormatter(result: ListCustomColumnsOutput): any {
  return [
    {
      type: "text" as const,
      text: `Found ${result.totalCount} custom column(s)\n\n${JSON.stringify(result.customColumns, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const listCustomColumnsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ListCustomColumnsInputSchema,
  outputSchema: ListCustomColumnsOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "List custom columns for an account",
      input: {
        customerId: "1234567890",
      },
    },
  ],
  logic: listCustomColumnsLogic,
  responseFormatter: listCustomColumnsResponseFormatter,
};
