// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import {
  BULK_JOB_OUTCOMES,
  classifyBulkJobStatus,
  normalizeGqlErrors,
} from "../utils/graphql-bulk-job.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_graphql_bulk_job";
const TOOL_TITLE = "TTD GraphQL Bulk Job Status";
const TOOL_DESCRIPTION = `Poll a TTD GraphQL bulk job (from \`ttd_graphql_query_bulk\` or \`ttd_graphql_mutation_bulk\`) for its status, error diagnostics, and result URL.

Returns \`terminal\` and \`outcome\` so you know when to stop polling, plus TTD's \`gqlErrors\` for failed or partly failed jobs.

### Status values
TTD's bulk-job status has six values:
- **QUEUED** — waiting to start. Keep polling.
- **IN_PROGRESS** — running. Keep polling.
- **SUCCESS** — finished; \`resultUrl\` available.
- **PARTIAL_SUCCESS** — finished, but some operations failed. **Terminal.** For a mutation job, the operations that succeeded stay applied and cannot be cancelled. Read \`gqlErrors\` and the result file before re-submitting anything.
- **FAILURE** — finished with no usable result. **Terminal.** See \`gqlErrors\`.
- **CANCELLED** — cancelled (query jobs only). **Terminal.**

Stop polling when \`terminal\` is true, which is any status other than QUEUED or IN_PROGRESS.

### Result file
\`resultUrl\` points to a JSON file containing the GraphQL response (\`{"data": …}\`), not a CSV. Fetch it with a plain HTTP GET and parse it as JSON. Do **not** use \`ttd_download_report\`, which only parses CSV. Result URLs expire after **1 hour**, so fetch promptly.`;

// Field set taken from TTD's own bulk-job samples (thetradedesk/platform,
// Python/FirstPartyData/GetAdvertiserFirstPartyDataBatchedGQL.py:158-164 and
// Python/ThirdPartyData/GetAllThirdPartyDataForPartnerBatchedGQL.py:215-222):
// `bulkJob(id:) { id status url gqlErrors }`, with `url` selected directly on the
// job. The earlier `... on BulkQueryJob { url } ... on BulkMutationJob { url }`
// fragments named types that appear in no TTD source. If those types did not
// exist, the whole query would fail validation.
//
// `createdAt` / `completedAt` predate that change. They appear in TTD's Workflows
// SDK mirror of the GQL bulk job (ttd-workflows-python graphqlbulkjob.py:51,61)
// but in none of TTD's GraphQL samples, so they are unverified as GraphQL fields.
// The Workflows mirror's `completionPercentage`, `runtimeErrors`, `rawResult` and
// `queryGqlErrors` are deliberately NOT requested. The mirror's names do not
// match GraphQL one-to-one (Workflows `queryGqlErrors` appears to be GraphQL
// `gqlErrors`), so they do not establish GraphQL field names, and one unknown
// field fails the whole poll.
const BULK_JOB_QUERY = `query BulkJob($id: ID!) {
  bulkJob(id: $id) {
    __typename
    id
    status
    createdAt
    completedAt
    url
    gqlErrors
  }
}`;

export const GraphqlBulkJobInputSchema = z
  .object({
    jobId: z
      .string()
      .min(1)
      .describe("Bulk job ID returned by ttd_graphql_query_bulk or ttd_graphql_mutation_bulk"),
  })
  .describe("Parameters for checking bulk job status");

export const GraphqlBulkJobOutputSchema = z
  .object({
    jobId: z.string().describe("Bulk job ID"),
    status: z
      .string()
      .describe(
        "Raw job status from TTD: QUEUED, IN_PROGRESS, SUCCESS, PARTIAL_SUCCESS, FAILURE or CANCELLED"
      ),
    outcome: z
      .enum(BULK_JOB_OUTCOMES)
      .describe(
        "Normalized status. `unrecognized` means TTD returned a value outside the six documented statuses"
      ),
    terminal: z
      .boolean()
      .describe(
        "True once the job will not change again (any status other than QUEUED / IN_PROGRESS). Stop polling when true."
      ),
    jobType: z.string().optional().describe("GraphQL __typename of the returned job object"),
    resultUrl: z
      .string()
      .optional()
      .describe(
        "URL of the JSON result file (GraphQL response JSON, not CSV). Fetch with a plain HTTP GET; expires ~1 hour after completion."
      ),
    gqlErrors: z
      .array(z.string())
      .optional()
      .describe(
        "Errors TTD recorded for the job (`bulkJob.gqlErrors`), e.g. authorization or internal failures. Check these on FAILURE and PARTIAL_SUCCESS."
      ),
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
    throw new McpError(JsonRpcErrorCode.InvalidRequest, `GraphQL error: ${messages}`);
  }

  const job = result.data?.bulkJob ?? result.bulkJob;
  if (!job) {
    throw new McpError(
      JsonRpcErrorCode.InvalidRequest,
      "GraphQL response contained no bulkJob data"
    );
  }

  const status = typeof job.status === "string" ? job.status : String(job.status ?? "");
  const { outcome, terminal } = classifyBulkJobStatus(status);
  const gqlErrors = normalizeGqlErrors(job.gqlErrors);

  return {
    jobId: job.id !== undefined && job.id !== null ? String(job.id) : input.jobId,
    status,
    outcome,
    terminal,
    ...(job.__typename && { jobType: job.__typename as string }),
    ...(job.url && { resultUrl: job.url as string }),
    ...(gqlErrors && { gqlErrors }),
    ...(job.createdAt && { createdAt: job.createdAt as string }),
    ...(job.completedAt && { completedAt: job.completedAt as string }),
    timestamp: new Date().toISOString(),
  };
}

function outcomeGuidance(result: GraphqlBulkJobOutput): string | undefined {
  switch (result.outcome) {
    case "queued":
    case "in_progress":
      return "Job still running. Poll again.";
    case "success":
      return result.resultUrl
        ? undefined
        : "Job reports SUCCESS but returned no result URL. TTD's samples treat a finished job with no url as failed, so check gqlErrors.";
    case "partial_success":
      return "⚠️ PARTIAL SUCCESS: some operations in this job failed. For a mutation job, the operations that succeeded stay applied and cannot be cancelled or rolled back. Re-submitting the whole input set would apply them again. Read gqlErrors and the result file, then retry only the failed inputs.";
    case "failure":
      return "❌ Job FAILED. No usable result. See gqlErrors below.";
    case "cancelled":
      return "Job was cancelled.";
    case "unrecognized":
      return `⚠️ Unrecognized status "${result.status}". Treated as terminal, following TTD's own polling rule (poll only while QUEUED / IN_PROGRESS). Report this value.`;
  }
}

export function graphqlBulkJobResponseFormatter(result: GraphqlBulkJobOutput): McpTextContent[] {
  const lines: string[] = [
    `Bulk job: ${result.jobId}`,
    `Status: ${result.status}${result.terminal ? " (terminal)" : ""}`,
  ];

  const guidance = outcomeGuidance(result);
  if (guidance) {
    lines.push(guidance);
  }

  if (result.jobType) {
    lines.push(`Type: ${result.jobType}`);
  }

  if (result.createdAt) {
    lines.push(`Created: ${result.createdAt}`);
  }

  if (result.completedAt) {
    lines.push(`Completed: ${result.completedAt}`);
  }

  if (result.gqlErrors?.length) {
    lines.push(`\nErrors (${result.gqlErrors.length}):`);
    for (const err of result.gqlErrors) {
      lines.push(`- ${err}`);
    }
  }

  if (result.resultUrl) {
    lines.push(`\nResult URL: ${result.resultUrl}`);
    lines.push(
      "The result is a JSON GraphQL response, not a CSV. Fetch it with an HTTP GET and parse it as JSON (ttd_download_report only parses CSV)."
    );
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
