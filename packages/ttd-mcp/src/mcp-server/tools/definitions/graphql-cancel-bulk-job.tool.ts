import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "ttd_graphql_cancel_bulk_job";
const TOOL_TITLE = "TTD GraphQL Cancel Bulk Job";
const TOOL_DESCRIPTION = `Cancel a running bulk GraphQL **query** job.

### ⚠️ Mutation jobs are NON-CANCELABLE
This tool only works for bulk query jobs submitted via \`ttd_graphql_query_bulk\`. Bulk mutation jobs submitted via \`ttd_graphql_mutation_bulk\` cannot be cancelled — the API will return an error if you attempt to cancel one.`;

const CANCEL_BULK_JOB_MUTATION = `mutation CancelBulkJob($jobId: ID!) {
  cancelBulkJob(jobId: $jobId) {
    jobId
    status
  }
}`;

export const GraphqlCancelBulkJobInputSchema = z
  .object({
    jobId: z
      .string()
      .min(1)
      .describe("Bulk job ID to cancel (query jobs only — mutation jobs are non-cancelable)"),
  })
  .describe("Parameters for cancelling a bulk query job");

export const GraphqlCancelBulkJobOutputSchema = z
  .object({
    jobId: z.string().describe("Cancelled bulk job ID"),
    status: z.string().describe("Job status after cancellation (expected: Cancelled)"),
    timestamp: z.string().datetime(),
  })
  .describe("Bulk job cancellation result");

type GraphqlCancelBulkJobInput = z.infer<typeof GraphqlCancelBulkJobInputSchema>;
type GraphqlCancelBulkJobOutput = z.infer<typeof GraphqlCancelBulkJobOutputSchema>;

export async function graphqlCancelBulkJobLogic(
  input: GraphqlCancelBulkJobInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GraphqlCancelBulkJobOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const result = (await ttdService.graphqlQuery(
    CANCEL_BULK_JOB_MUTATION,
    { jobId: input.jobId },
    context
  )) as Record<string, any>;

  const job = result.data?.cancelBulkJob ?? result.cancelBulkJob ?? {};

  return {
    jobId: (job.jobId as string) ?? input.jobId,
    status: job.status as string,
    timestamp: new Date().toISOString(),
  };
}

export function graphqlCancelBulkJobResponseFormatter(result: GraphqlCancelBulkJobOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Bulk job cancelled.\n\nJob ID: ${result.jobId}\nStatus: ${result.status}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const graphqlCancelBulkJobTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GraphqlCancelBulkJobInputSchema,
  outputSchema: GraphqlCancelBulkJobOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Cancel a running bulk query job",
      input: {
        jobId: "bulkjob-abc123def456",
      },
    },
    {
      label: "Cancel a queued bulk query job before it starts",
      input: {
        jobId: "bulkjob-xyz789uvw012",
      },
    },
  ],
  logic: graphqlCancelBulkJobLogic,
  responseFormatter: graphqlCancelBulkJobResponseFormatter,
};
