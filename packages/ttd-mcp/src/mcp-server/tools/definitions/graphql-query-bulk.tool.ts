import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "ttd_graphql_query_bulk";
const TOOL_TITLE = "TTD GraphQL Query Bulk";
const TOOL_DESCRIPTION = `Submit a bulk GraphQL query job to The Trade Desk.

Runs the same GraphQL query across many variable sets in parallel as an async bulk job. Returns a job ID that can be polled with \`ttd_graphql_bulk_job\`.

### Constraints
- **Concurrency:** max 10 active jobs / 20 queued jobs per partner
- **Result URL:** expires after 1 hour — download promptly via \`ttd_download_report\`

### Example
\`\`\`graphql
query Advertiser($id: ID!) {
  advertiser(id: $id) {
    name
    totalCampaignChannelCount
  }
}
\`\`\`
With variables: \`[{ "id": "adv1" }, { "id": "adv2" }, { "id": "adv3" }]\``;

const CREATE_QUERY_BULK_MUTATION = `mutation CreateQueryBulk($input: CreateQueryBulkInput!) {
  createQueryBulk(input: $input) {
    jobId
    status
  }
}`;

export const GraphqlQueryBulkInputSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .describe("GraphQL query string to execute for each variable set"),
    variables: z
      .array(z.record(z.any()))
      .min(1)
      .describe("Array of variable objects — one per entity"),
    operationName: z
      .string()
      .optional()
      .describe("GraphQL operation name (if query contains multiple operations)"),
  })
  .describe("Parameters for submitting a bulk GraphQL query job");

export const GraphqlQueryBulkOutputSchema = z
  .object({
    jobId: z.string().describe("Bulk job ID for polling status"),
    status: z.string().describe("Job status (Queued, Running, Complete, Failed, Cancelled)"),
    timestamp: z.string().datetime(),
  })
  .describe("Bulk query job submission result");

type GraphqlQueryBulkInput = z.infer<typeof GraphqlQueryBulkInputSchema>;
type GraphqlQueryBulkOutput = z.infer<typeof GraphqlQueryBulkOutputSchema>;

export async function graphqlQueryBulkLogic(
  input: GraphqlQueryBulkInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GraphqlQueryBulkOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const variables = {
    input: {
      query: input.query,
      variables: input.variables,
      ...(input.operationName && { operationName: input.operationName }),
    },
  };

  const result = (await ttdService.graphqlQuery(
    CREATE_QUERY_BULK_MUTATION,
    variables,
    context
  )) as Record<string, any>;

  const job = result.data?.createQueryBulk ?? result.createQueryBulk ?? {};

  return {
    jobId: job.jobId as string,
    status: job.status as string,
    timestamp: new Date().toISOString(),
  };
}

export function graphqlQueryBulkResponseFormatter(result: GraphqlQueryBulkOutput): any {
  return [
    {
      type: "text" as const,
      text: `Bulk query job submitted.\n\nJob ID: ${result.jobId}\nStatus: ${result.status}\n\nUse \`ttd_graphql_bulk_job\` with jobId "${result.jobId}" to poll for completion.\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const graphqlQueryBulkTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GraphqlQueryBulkInputSchema,
  outputSchema: GraphqlQueryBulkOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Bulk query details for multiple advertisers",
      input: {
        query: "query GetAdvertiser($id: ID!) { advertiser(id: $id) { id name status totalCampaignChannelCount } }",
        variables: [
          { id: "adv123abc" },
          { id: "adv456def" },
          { id: "adv789ghi" },
        ],
        operationName: "GetAdvertiser",
      },
    },
    {
      label: "Bulk query campaign budget and pacing for multiple campaigns",
      input: {
        query: "query GetCampaign($id: ID!) { campaign(id: $id) { id name budget { amount currencyCode } pacingMode availability } }",
        variables: [
          { id: "camp456def" },
          { id: "camp789ghi" },
          { id: "camp012jkl" },
        ],
      },
    },
  ],
  logic: graphqlQueryBulkLogic,
  responseFormatter: graphqlQueryBulkResponseFormatter,
};
