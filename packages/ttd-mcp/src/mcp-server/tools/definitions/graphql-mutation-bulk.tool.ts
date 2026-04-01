// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";
import { McpError, JsonRpcErrorCode } from "../../../utils/errors/index.js";

const TOOL_NAME = "ttd_graphql_mutation_bulk";
const TOOL_TITLE = "TTD GraphQL Mutation Bulk";
const TOOL_DESCRIPTION = `Submit a bulk GraphQL mutation job to The Trade Desk.

Applies the same mutation across many input sets in parallel as an async bulk job. Returns a job ID that can be polled with \`ttd_graphql_bulk_job\`.

### ⚠️ NON-CANCELABLE
Mutation bulk jobs **cannot be cancelled** once submitted. Use \`ttd_graphql_query_bulk\` for read-only queries if you need cancellation support.

### Constraints
- **Max 1000 inputs** per job
- **Max 15,000 lexical tokens** for the mutation string (~60,000 characters)
- **Non-cancelable** once submitted
- **Concurrency:** max 10 active jobs / 20 queued jobs per partner
- **Result URL:** expires after 1 hour — download promptly via \`ttd_download_report\`

### Example
\`\`\`graphql
mutation UpdateCampaign($input: UpdateCampaignInput!) {
  updateCampaign(input: $input) {
    campaign { campaignId name }
  }
}
\`\`\`
With inputs: \`[{ "campaignId": "c1", "name": "New Name 1" }, { "campaignId": "c2", "name": "New Name 2" }]\``;

const MAX_MUTATION_CHARS = 60_000; // ~15,000 lexical tokens (chars/4 as conservative proxy)

const CREATE_MUTATION_BULK_MUTATION = `mutation CreateMutationBulk($input: CreateMutationBulkInput!) {
  createMutationBulk(input: $input) {
    jobId
    status
  }
}`;

export const GraphqlMutationBulkInputSchema = z
  .object({
    mutation: z
      .string()
      .min(1)
      .describe("GraphQL mutation string"),
    inputs: z
      .array(z.record(z.any()))
      .min(1)
      .max(1000)
      .describe("Array of input objects — one per entity (max 1000)"),
    operationName: z
      .string()
      .optional()
      .describe("GraphQL operation name (if mutation contains multiple operations)"),
  })
  .superRefine((data, ctx) => {
    if (data.mutation.length > MAX_MUTATION_CHARS) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: MAX_MUTATION_CHARS,
        type: "string",
        inclusive: true,
        path: ["mutation"],
        message: `Mutation string exceeds ${MAX_MUTATION_CHARS} characters (~15,000 lexical tokens). TTD enforces a 15,000 token limit on bulk mutation strings.`,
      });
    }
  })
  .describe("Parameters for submitting a bulk GraphQL mutation job");

export const GraphqlMutationBulkOutputSchema = z
  .object({
    jobId: z.string().describe("Bulk job ID for polling status"),
    status: z.string().describe("Job status (Queued, Running, Complete, Failed, Cancelled)"),
    timestamp: z.string().datetime(),
  })
  .describe("Bulk mutation job submission result");

type GraphqlMutationBulkInput = z.infer<typeof GraphqlMutationBulkInputSchema>;
type GraphqlMutationBulkOutput = z.infer<typeof GraphqlMutationBulkOutputSchema>;

function extractGraphqlMutationJobOrThrow(
  result: Record<string, any>
): Record<string, unknown> {
  const errors = result.errors ?? result.data?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const messages = errors.map((e: any) => e.message ?? JSON.stringify(e)).join("; ");
    throw new McpError(
      JsonRpcErrorCode.InvalidRequest,
      `TTD GraphQL bulk mutation failed: ${messages}`,
      { errors }
    );
  }

  const job = result.data?.createMutationBulk ?? result.createMutationBulk;
  if (!job?.jobId || !job?.status) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      "TTD GraphQL bulk mutation response did not include createMutationBulk.jobId/status",
      { result }
    );
  }

  return job as Record<string, unknown>;
}

export async function graphqlMutationBulkLogic(
  input: GraphqlMutationBulkInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GraphqlMutationBulkOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const variables = {
    input: {
      mutation: input.mutation,
      inputs: input.inputs,
      ...(input.operationName && { operationName: input.operationName }),
    },
  };

  const result = (await ttdService.graphqlQuery(
    CREATE_MUTATION_BULK_MUTATION,
    variables,
    context
  )) as Record<string, any>;

  const job = extractGraphqlMutationJobOrThrow(result);

  return {
    jobId: job.jobId as string,
    status: job.status as string,
    timestamp: new Date().toISOString(),
  };
}

export function graphqlMutationBulkResponseFormatter(result: GraphqlMutationBulkOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `⚠️ Bulk mutation job submitted (NON-CANCELABLE).\n\nJob ID: ${result.jobId}\nStatus: ${result.status}\n\nUse \`ttd_graphql_bulk_job\` with jobId "${result.jobId}" to poll for completion.\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const graphqlMutationBulkTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GraphqlMutationBulkInputSchema,
  outputSchema: GraphqlMutationBulkOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    idempotentHint: false,
    destructiveHint: true,
  },
  inputExamples: [
    {
      label: "Batch update campaign names via bulk mutation",
      input: {
        mutation: "mutation UpdateCampaign($input: UpdateCampaignInput!) { updateCampaign(input: $input) { campaign { campaignId name } } }",
        inputs: [
          { campaignId: "camp456def", name: "Q1 2025 Brand Awareness - Updated" },
          { campaignId: "camp789ghi", name: "Q1 2025 Retargeting - Updated" },
          { campaignId: "camp012jkl", name: "Q1 2025 Prospecting - Updated" },
        ],
        operationName: "UpdateCampaign",
      },
    },
    {
      label: "Batch update ad group bids via bulk mutation",
      input: {
        mutation: "mutation UpdateAdGroup($input: UpdateAdGroupInput!) { updateAdGroup(input: $input) { adGroup { adGroupId baseBidCPM { amount } } } }",
        inputs: [
          { adGroupId: "adg111aaa", baseBidCPM: { amount: 4.5, currencyCode: "USD" } },
          { adGroupId: "adg222bbb", baseBidCPM: { amount: 6.0, currencyCode: "USD" } },
        ],
      },
    },
  ],
  logic: graphqlMutationBulkLogic,
  responseFormatter: graphqlMutationBulkResponseFormatter,
};
