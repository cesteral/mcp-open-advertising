import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "sa360_search_fields";
const TOOL_TITLE = "SA360 Field Discovery";
const TOOL_DESCRIPTION = `Discover available fields, resources, and metrics in the SA360 API.

Uses the searchAds360Fields endpoint to explore the API schema. Query with a field name or resource name to find available fields, their types, and whether they can be selected, filtered, or sorted.

**Example queries:**
- \`SELECT name, category, data_type, selectable, filterable, sortable FROM searchAds360Fields WHERE name = 'campaign.id'\`
- \`SELECT name, category FROM searchAds360Fields WHERE name LIKE 'campaign.%'\`
- \`SELECT name FROM searchAds360Fields WHERE name LIKE 'metrics.%'\``;

export const SearchFieldsInputSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .describe("SA360 field query (e.g., SELECT name FROM searchAds360Fields WHERE name LIKE 'campaign.%')"),
    pageSize: z
      .number()
      .min(1)
      .max(1000)
      .optional()
      .default(100)
      .describe("Max results to return (default 100)"),
  })
  .describe("Parameters for field discovery");

export const SearchFieldsOutputSchema = z
  .object({
    fields: z.array(z.record(z.any())).describe("Field metadata results"),
    totalSize: z.number().optional().describe("Total fields matching query"),
    timestamp: z.string().datetime(),
  })
  .describe("Field discovery results");

type SearchFieldsInput = z.infer<typeof SearchFieldsInputSchema>;
type SearchFieldsOutput = z.infer<typeof SearchFieldsOutputSchema>;

export async function searchFieldsLogic(
  input: SearchFieldsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<SearchFieldsOutput> {
  const { sa360Service } = resolveSessionServices(sdkContext);

  const result = await sa360Service.searchFields(input.query, input.pageSize, context);

  return {
    fields: result.fields as Record<string, any>[],
    totalSize: result.totalSize,
    timestamp: new Date().toISOString(),
  };
}

export function searchFieldsResponseFormatter(result: SearchFieldsOutput): any {
  return [
    {
      type: "text" as const,
      text: `Found ${result.fields.length} field(s)${result.totalSize ? ` (${result.totalSize} total)` : ""}\n\n${JSON.stringify(result.fields, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const searchFieldsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: SearchFieldsInputSchema,
  outputSchema: SearchFieldsOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Discover campaign fields",
      input: {
        query: "SELECT name, category, data_type, selectable, filterable, sortable FROM searchAds360Fields WHERE name LIKE 'campaign.%'",
      },
    },
    {
      label: "Discover available metrics",
      input: {
        query: "SELECT name, data_type FROM searchAds360Fields WHERE name LIKE 'metrics.%'",
        pageSize: 200,
      },
    },
  ],
  logic: searchFieldsLogic,
  responseFormatter: searchFieldsResponseFormatter,
};
