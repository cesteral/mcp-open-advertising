// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";
import { McpError, JsonRpcErrorCode } from "../../../utils/errors/index.js";

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
    data {
      id
      status
    }
    errors {
      __typename
    }
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
    betaFeatures: z
      .string()
      .optional()
      .describe("Optional TTD-GQL-Beta header value to enable beta GraphQL features"),
  })
  .describe("Parameters for submitting a bulk GraphQL query job");

export const GraphqlQueryBulkOutputSchema = z
  .object({
    jobId: z.string().describe("Bulk job ID for polling status"),
    status: z.string().describe("Job status (QUEUED, RUNNING, SUCCESS, FAILURE, CANCELLED)"),
    timestamp: z.string().datetime(),
  })
  .describe("Bulk query job submission result");

type GraphqlQueryBulkInput = z.infer<typeof GraphqlQueryBulkInputSchema>;
type GraphqlQueryBulkOutput = z.infer<typeof GraphqlQueryBulkOutputSchema>;

function extractBulkJobOrThrow(
  result: Record<string, any>,
  mutationName: string
): { id: string; status: string } {
  const errors = result.errors ?? result.data?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const messages = errors.map((e: any) => e.message ?? JSON.stringify(e)).join("; ");
    throw new McpError(
      JsonRpcErrorCode.InvalidRequest,
      `TTD GraphQL bulk request failed: ${messages}`,
      { errors }
    );
  }

  const payload = result.data?.[mutationName] ?? result[mutationName];
  const payloadErrors = payload?.errors;
  if (Array.isArray(payloadErrors) && payloadErrors.length > 0) {
    const messages = payloadErrors
      .map((e: any) => e.message ?? e.__typename ?? JSON.stringify(e))
      .join("; ");
    throw new McpError(
      JsonRpcErrorCode.InvalidRequest,
      `TTD GraphQL bulk request failed: ${messages}`,
      { errors: payloadErrors }
    );
  }

  const job = payload?.data;
  if (!job?.id || !job?.status) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `TTD GraphQL bulk response did not include ${mutationName}.data.id/status`,
      { result }
    );
  }

  return { id: job.id as string, status: job.status as string };
}

export async function graphqlQueryBulkLogic(
  input: GraphqlQueryBulkInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GraphqlQueryBulkOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const variables = {
    input: {
      query: input.query,
      queryVariables: JSON.stringify(input.variables),
    },
  };

  const result = (await ttdService.graphqlQuery(
    CREATE_QUERY_BULK_MUTATION,
    variables,
    context,
    { betaFeatures: input.betaFeatures }
  )) as Record<string, any>;

  const job = extractBulkJobOrThrow(result, "createQueryBulk");

  return {
    jobId: job.id,
    status: job.status,
    timestamp: new Date().toISOString(),
  };
}

export function graphqlQueryBulkResponseFormatter(result: GraphqlQueryBulkOutput): McpTextContent[] {
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
    destructiveHint: false,
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
        betaFeatures: "my-beta-flag",
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
