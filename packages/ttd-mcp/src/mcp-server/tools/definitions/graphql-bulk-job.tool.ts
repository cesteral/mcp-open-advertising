// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_graphql_bulk_job";
const TOOL_TITLE = "TTD GraphQL Bulk Job Status";
const TOOL_DESCRIPTION = `Check the status of a bulk GraphQL job and retrieve its result URL when complete.

Returns job progress, status, and a download URL when the job finishes. Result URLs expire after **1 hour** — use \`ttd_download_report\` to download promptly.

### Status Values
- **QUEUED** — waiting to start
- **RUNNING** — in progress
- **SUCCESS** — finished; url available
- **FAILURE** — job failed
- **CANCELLED** — job was cancelled`;

const BULK_JOB_QUERY = `query BulkJob($id: ID!) {
  bulkJob(id: $id) {
    __typename
    id
    status
    createdAt
    completedAt
    ... on BulkQueryJob {
      url
    }
    ... on BulkMutationJob {
      url
    }
  }
}`;

export const GraphqlBulkJobInputSchema = z
  .object({
    jobId: z
      .string()
      .min(1)
      .describe("Bulk job ID returned by createQueryBulk or createMutationBulk"),
  })
  .describe("Parameters for checking bulk job status");

export const GraphqlBulkJobOutputSchema = z
  .object({
    jobId: z.string().describe("Bulk job ID"),
    status: z.string().describe("Job status (QUEUED, RUNNING, SUCCESS, FAILURE, CANCELLED)"),
    jobType: z.string().optional().describe("Concrete job type (BulkQueryJob or BulkMutationJob)"),
    resultUrl: z.string().optional().describe("URL to download results (available on SUCCESS)"),
    createdAt: z.string().optional().describe("ISO datetime when the job was created"),
    completedAt: z.string().optional().describe("ISO datetime when the job completed"),
    timestamp: z.string().datetime(),
  })
  .describe("Bulk job status result");

type GraphqlBulkJobInput = z.infer<typeof GraphqlBulkJobInputSchema>;
type GraphqlBulkJobOutput = z.infer<typeof GraphqlBulkJobOutputSchema>;

export async function graphqlBulkJobLogic(
  input: GraphqlBulkJobInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GraphqlBulkJobOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const result = (await ttdService.graphqlQuery(
    BULK_JOB_QUERY,
    { id: input.jobId },
    context
  )) as Record<string, any>;

  const errors = result.errors ?? result.data?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const messages = errors.map((e: any) => e.message ?? JSON.stringify(e)).join("; ");
    throw new Error(`GraphQL error: ${messages}`);
  }

  const job = result.data?.bulkJob ?? result.bulkJob;
  if (!job) {
    throw new Error("GraphQL response contained no bulkJob data");
  }

  return {
    jobId: (job.id as string) ?? input.jobId,
    status: job.status as string,
    ...(job.__typename && { jobType: job.__typename as string }),
    ...(job.url && { resultUrl: job.url as string }),
    ...(job.createdAt && { createdAt: job.createdAt as string }),
    ...(job.completedAt && { completedAt: job.completedAt as string }),
    timestamp: new Date().toISOString(),
  };
}

export function graphqlBulkJobResponseFormatter(result: GraphqlBulkJobOutput): McpTextContent[] {
  const lines: string[] = [
    `Bulk job: ${result.jobId}`,
    `Status: ${result.status}`,
  ];

  if (result.jobType) {
    lines.push(`Type: ${result.jobType}`);
  }

  if (result.createdAt) {
    lines.push(`Created: ${result.createdAt}`);
  }

  if (result.completedAt) {
    lines.push(`Completed: ${result.completedAt}`);
  }

  if (result.resultUrl) {
    lines.push(`\nResult URL: ${result.resultUrl}`);
    lines.push(`⚠️ Result URL expires ~1 hour after the job completes. Download promptly.`);
  }

  lines.push(`\nTimestamp: ${result.timestamp}`);

  return [
    {
      type: "text" as const,
      text: lines.join("\n"),
    },
  ];
}

export const graphqlBulkJobTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GraphqlBulkJobInputSchema,
  outputSchema: GraphqlBulkJobOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Check status of a bulk query job",
      input: {
        jobId: "2989826",
      },
    },
    {
      label: "Poll a bulk mutation job for completion",
      input: {
        jobId: "2989827",
      },
    },
  ],
  logic: graphqlBulkJobLogic,
  responseFormatter: graphqlBulkJobResponseFormatter,
};
