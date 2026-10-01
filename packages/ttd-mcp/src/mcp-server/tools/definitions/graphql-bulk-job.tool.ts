// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import {
  BULK_JOB_OUTCOMES,
  bulkJobIdLiteral,
  classifyBulkJobStatus,
  normalizeGqlErrors,
  normalizeMutationGqlErrors,
} from "../utils/graphql-bulk-job.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_graphql_bulk_job";
const TOOL_TITLE = "TTD GraphQL Bulk Job Status";
const TOOL_DESCRIPTION = `Poll a TTD GraphQL bulk job (from \`ttd_graphql_query_bulk\` or \`ttd_graphql_mutation_bulk\`) for its status, error diagnostics, and result.

Returns \`terminal\` and \`outcome\` so you know when to stop polling. For a bulk **mutation** job, \`mutationGqlErrors\` lists the inputs that failed, each with its \`index\` in the submitted \`inputs\`. For a bulk **query** job, failures are in \`queryGqlErrors\`. \`runtimeErrors\` carries errors from running the job itself.

### Status values
TTD's bulk-job status has these values:
- **QUEUED** — waiting to start. Keep polling.
- **IN_PROGRESS** — running. Keep polling.
- **SUCCESS** — finished; the result is in \`rawResult\` (small results) or at \`resultUrl\`.
- **PARTIAL_SUCCESS** — finished, but only part of the job succeeded. **Terminal.** For a mutation job, the inputs that succeeded stay applied and cannot be cancelled or rolled back. Read \`mutationGqlErrors\` before re-submitting anything: retry only the failed \`index\`es.
- **FAILURE** — finished with nothing retrieved and nothing updated. **Terminal.** See \`runtimeErrors\`.
- **CANCELLED** — cancelled (query jobs only). **Terminal.**

Stop polling when \`terminal\` is true, which is any status other than QUEUED or IN_PROGRESS.

### Result
A small result comes back inline as \`rawResult\`; otherwise fetch \`resultUrl\`. The file is JSON containing the GraphQL response (results and errors merged), not a CSV. Fetch it with a plain HTTP GET and parse it as JSON. Do **not** use \`ttd_download_report\`, which only parses CSV. The result expires **1 hour** after \`completedAt\`, so fetch promptly; only the user who submitted the job can read it.`;

// The poll is TTD's own bulkJob example (Bulk operations page, "Check job status
// and retrieve results", read 2026-10-01), field for field. A job id is written as
// the page writes it, a literal (`bulkJob(id: 123)`), because the page does not
// show the argument's declared type and a literal is valid for an ID or an
// integer. `gqlErrors`, which this query used to select from TTD's sample
// scripts, is not in the page's example and is not requested: one unknown field
// fails the whole poll, and the typed fragments below are where the page puts
// per-job errors.
function bulkJobQuery(jobId: string): string {
  return `query BulkJob {
  bulkJob(id: ${bulkJobIdLiteral(jobId)}) {
    __typename
    id
    createdAt
    rawResult
    completionPercentage
    completedAt
    status
    url
    runtimeErrors
    ... on BulkMutationJob {
      mutationGqlErrors {
        error
        index
      }
    }
    ... on BulkQueryJob {
      queryGqlErrors
    }
  }
}`;
}

export const GraphqlBulkJobInputSchema = z
  .object({
    jobId: z
      .string()
      .min(1)
      .regex(/^[A-Za-z0-9_-]+$/, "A bulk job id is numeric, for example 2989826")
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
    mutationGqlErrors: z
      .array(
        z.object({
          error: z.string().describe("TTD's error text for the failed input"),
          index: z
            .number()
            .int()
            .optional()
            .describe(
              "Position of the failed input in the submitted `inputs` (0-based as TTD reports it)"
            ),
        })
      )
      .optional()
      .describe(
        "Bulk MUTATION jobs: the inputs that failed (`bulkJob ... on BulkMutationJob { mutationGqlErrors { error index } }`). Check these on PARTIAL_SUCCESS and FAILURE, and retry only these inputs."
      ),
    queryGqlErrors: z
      .array(z.string())
      .optional()
      .describe(
        "Bulk QUERY jobs: errors in the submitted query (`bulkJob ... on BulkQueryJob { queryGqlErrors }`)."
      ),
    runtimeErrors: z
      .array(z.string())
      .optional()
      .describe(
        "Errors from running the job itself (`bulkJob.runtimeErrors`), e.g. authorization or internal failures."
      ),
    completionPercentage: z
      .number()
      .optional()
      .describe("How much of the job has run, as TTD reports it (`bulkJob.completionPercentage`)"),
    rawResult: z
      .string()
      .optional()
      .describe(
        "The result inline, when TTD says it is small enough (`bulkJob.rawResult`); otherwise fetch `resultUrl`. JSON text."
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
    bulkJobQuery(input.jobId),
    undefined,
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
  const mutationGqlErrors = normalizeMutationGqlErrors(job.mutationGqlErrors);
  const queryGqlErrors = normalizeGqlErrors(job.queryGqlErrors);
  const runtimeErrors = normalizeGqlErrors(job.runtimeErrors);

  return {
    jobId: job.id !== undefined && job.id !== null ? String(job.id) : input.jobId,
    status,
    outcome,
    terminal,
    ...(job.__typename && { jobType: job.__typename as string }),
    ...(job.url && { resultUrl: job.url as string }),
    ...(typeof job.completionPercentage === "number" && {
      completionPercentage: job.completionPercentage,
    }),
    ...(runtimeErrors && { runtimeErrors }),
    ...(mutationGqlErrors && { mutationGqlErrors }),
    ...(queryGqlErrors && { queryGqlErrors }),
    ...(typeof job.rawResult === "string" &&
      job.rawResult.length > 0 && { rawResult: job.rawResult }),
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
        : result.rawResult
          ? undefined
          : "Job reports SUCCESS but returned neither a result URL nor an inline result. Check runtimeErrors.";
    case "partial_success":
      return "⚠️ PARTIAL SUCCESS: some operations in this job failed. For a mutation job, the operations that succeeded stay applied and cannot be cancelled or rolled back. Re-submitting the whole input set would apply them again. Read mutationGqlErrors (each names the failed input by index) and the result file, then retry only the failed inputs.";
    case "failure":
      return "❌ Job FAILED. No usable result. See the errors below.";
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

  if (result.completionPercentage !== undefined) {
    lines.push(`Completion: ${result.completionPercentage}%`);
  }

  if (result.mutationGqlErrors?.length) {
    lines.push(`\nFailed inputs (${result.mutationGqlErrors.length}):`);
    for (const err of result.mutationGqlErrors) {
      lines.push(`- ${err.index !== undefined ? `input #${err.index}: ` : ""}${err.error}`);
    }
  }

  if (result.queryGqlErrors?.length) {
    lines.push(`\nQuery errors (${result.queryGqlErrors.length}):`);
    for (const err of result.queryGqlErrors) lines.push(`- ${err}`);
  }

  if (result.runtimeErrors?.length) {
    lines.push(`\nRuntime errors (${result.runtimeErrors.length}):`);
    for (const err of result.runtimeErrors) lines.push(`- ${err}`);
  }

  if (result.rawResult) {
    const preview =
      result.rawResult.length > 2000
        ? `${result.rawResult.slice(0, 2000)}… (truncated)`
        : result.rawResult;
    lines.push(`\nInline result:\n${preview}`);
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
  // The error fields are TTD's own text for the job, and `rawResult` is the job's
  // result (entity data, names), echoed in the structured result and in the text
  // block. `resultUrl` is platform-generated.
  untrustedContent: {
    structuredPaths: ["$.runtimeErrors", "$.mutationGqlErrors", "$.queryGqlErrors", "$.rawResult"],
    contentBlocks: [0],
  },
};
