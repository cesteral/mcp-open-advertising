import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "../../../utils/internal/request-context.js";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "ttd_graphql_query";
const TOOL_TITLE = "TTD GraphQL Query";
const TOOL_DESCRIPTION = `Execute a GraphQL query or mutation against The Trade Desk's GraphQL API.

This is a passthrough tool that accepts any valid TTD GraphQL query/mutation, enabling:
- **Deep nested queries** — fetch advertiser → campaigns → ad groups → audiences in one call
- **Rich entity model** — access fields not available in REST (audience uniques, decision scores, etc.)
- **Mutations** — create/update entities with the full TTD GraphQL schema

### Example Query
\`\`\`graphql
query Advertiser($id: ID!) {
  advertiser(id: $id) {
    name
    totalCampaignChannelCount
    vettingStatus
  }
}
\`\`\`

Refer to the TTD Partner Portal GraphQL documentation for the full schema.`;

export const GraphqlQueryInputSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .describe("GraphQL query or mutation string"),
    variables: z
      .record(z.any())
      .optional()
      .describe("GraphQL variables (key-value object)"),
  })
  .describe("Parameters for executing a TTD GraphQL query");

export const GraphqlQueryOutputSchema = z
  .object({
    data: z.any().describe("GraphQL response data"),
    errors: z.array(z.record(z.any())).optional().describe("GraphQL errors, if any"),
    timestamp: z.string().datetime(),
  })
  .describe("GraphQL query result");

type GraphqlInput = z.infer<typeof GraphqlQueryInputSchema>;
type GraphqlOutput = z.infer<typeof GraphqlQueryOutputSchema>;

export async function graphqlQueryLogic(
  input: GraphqlInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GraphqlOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const result = (await ttdService.graphqlQuery(
    input.query,
    input.variables,
    context
  )) as Record<string, unknown>;

  return {
    data: result.data ?? result,
    errors: result.errors as Record<string, any>[] | undefined,
    timestamp: new Date().toISOString(),
  };
}

export function graphqlQueryResponseFormatter(result: GraphqlOutput): any {
  const errorInfo = result.errors?.length
    ? `\n\nGraphQL Errors:\n${JSON.stringify(result.errors, null, 2)}`
    : "";

  return [
    {
      type: "text" as const,
      text: `GraphQL response:\n${JSON.stringify(result.data, null, 2)}${errorInfo}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const graphqlQueryTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GraphqlQueryInputSchema,
  outputSchema: GraphqlQueryOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    idempotentHint: false,
  },
  logic: graphqlQueryLogic,
  responseFormatter: graphqlQueryResponseFormatter,
};
