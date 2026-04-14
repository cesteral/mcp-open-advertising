// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_graphql_cancel_bulk_job";
const TOOL_TITLE = "TTD GraphQL Cancel Bulk Job";
const TOOL_DESCRIPTION = `Cancel a running bulk GraphQL **query** job.

### ⚠️ Mutation jobs are NON-CANCELABLE
This tool only works for bulk query jobs submitted via \`ttd_graphql_query_bulk\`. Bulk mutation jobs submitted via \`ttd_graphql_mutation_bulk\` cannot be cancelled — the API will return an error if you attempt to cancel one.`;

const CANCEL_BULK_JOB_MUTATION = `mutation CancelBulkJob($input: CancelBulkJobInput!) {
  cancelBulkJob(input: $input) {
    data {
      id
      status
    }
    errors {
      __typename
    }
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
    status: z.string().describe("Job status after cancellation (expected: CANCELLED)"),
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
    { input: { jobId: input.jobId } },
    context
  )) as Record<string, any>;

  const errors = result.errors ?? result.data?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const messages = errors.map((e: any) => e.message ?? JSON.stringify(e)).join("; ");
    throw new Error(`GraphQL error: ${messages}`);
  }

  const payload = result.data?.cancelBulkJob ?? result.cancelBulkJob;
  if (!payload) {
    throw new Error("GraphQL response contained no cancelBulkJob data");
  }

  const payloadErrors = payload.errors;
  if (Array.isArray(payloadErrors) && payloadErrors.length > 0) {
    const messages = payloadErrors
      .map((e: any) => e.message ?? e.__typename ?? JSON.stringify(e))
      .join("; ");
    throw new Error(`Cannot cancel bulk job: ${messages}`);
  }

  const job = payload.data;
  if (!job) {
    throw new Error("cancelBulkJob returned no data");
  }

  return {
    jobId: (job.id as string) ?? input.jobId,
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
        jobId: "2989826",
      },
    },
    {
      label: "Cancel a queued bulk query job before it starts",
      input: {
        jobId: "2989827",
      },
    },
  ],
  logic: graphqlCancelBulkJobLogic,
  responseFormatter: graphqlCancelBulkJobResponseFormatter,
};
