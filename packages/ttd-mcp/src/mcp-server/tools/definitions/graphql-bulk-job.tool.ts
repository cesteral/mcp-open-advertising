import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "ttd_graphql_bulk_job";
const TOOL_TITLE = "TTD GraphQL Bulk Job Status";
const TOOL_DESCRIPTION = `Check the status of a bulk GraphQL job and retrieve its result URL when complete.

Returns job progress, status, and a download URL when the job finishes. Result URLs expire after **1 hour** — use \`ttd_download_report\` to download promptly.

### Status Values
- **Queued** — waiting to start
- **Running** — in progress
- **Complete** — finished; resultUrl available
- **Failed** — job failed; check errorMessage
- **Cancelled** — job was cancelled`;

const BULK_JOB_QUERY = `query BulkJob($jobId: ID!) {
  bulkJob(jobId: $jobId) {
    jobId
    status
    resultUrl
    resultExpiresAt
    errorMessage
    progress {
      completed
      total
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
    status: z.string().describe("Job status (Queued, Running, Complete, Failed, Cancelled)"),
    resultUrl: z.string().optional().describe("URL to download results (available when Complete)"),
    resultExpiresAt: z.string().optional().describe("ISO datetime when resultUrl expires"),
    errorMessage: z.string().optional().describe("Error message if job failed"),
    progress: z
      .object({
        completed: z.number(),
        total: z.number(),
      })
      .optional()
      .describe("Job progress (completed/total)"),
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
    { jobId: input.jobId },
    context
  )) as Record<string, any>;

  const job = result.data?.bulkJob ?? result.bulkJob ?? {};

  return {
    jobId: (job.jobId as string) ?? input.jobId,
    status: job.status as string,
    ...(job.resultUrl && { resultUrl: job.resultUrl as string }),
    ...(job.resultExpiresAt && { resultExpiresAt: job.resultExpiresAt as string }),
    ...(job.errorMessage && { errorMessage: job.errorMessage as string }),
    ...(job.progress && {
      progress: {
        completed: job.progress.completed as number,
        total: job.progress.total as number,
      },
    }),
    timestamp: new Date().toISOString(),
  };
}

export function graphqlBulkJobResponseFormatter(result: GraphqlBulkJobOutput): any {
  const lines: string[] = [
    `Bulk job: ${result.jobId}`,
    `Status: ${result.status}`,
  ];

  if (result.progress) {
    const pct = result.progress.total > 0
      ? Math.round((result.progress.completed / result.progress.total) * 100)
      : 0;
    lines.push(`Progress: ${result.progress.completed}/${result.progress.total} (${pct}%)`);
  }

  if (result.resultUrl) {
    lines.push(`\nResult URL: ${result.resultUrl}`);
    if (result.resultExpiresAt) {
      const expiresAt = new Date(result.resultExpiresAt);
      const minutesLeft = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60_000));
      lines.push(`⚠️ Result URL expires in ~${minutesLeft} minutes. Download promptly using \`ttd_download_report\`.`);
    }
  }

  if (result.errorMessage) {
    lines.push(`\nError: ${result.errorMessage}`);
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
        jobId: "bulkjob-abc123def456",
      },
    },
    {
      label: "Poll a bulk mutation job for completion",
      input: {
        jobId: "bulkjob-xyz789uvw012",
      },
    },
  ],
  logic: graphqlBulkJobLogic,
  responseFormatter: graphqlBulkJobResponseFormatter,
};
