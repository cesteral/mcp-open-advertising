// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  McpError,
  JsonRpcErrorCode,
  assertGovernedEffectDryRun,
  EffectResultSchema,
  EffectDryRunResultSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  McpTextContent,
  RequestContext,
  SdkContext,
  EffectResult,
  EffectDryRunResult,
  DispatchedCapability,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

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
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the cancellation and returns an EffectDryRunResult under `dryRun` (expected effect = the job would be cancelled) without calling the TTD API. The job is not cancelled."
      ),
  })
  .describe("Parameters for cancelling a bulk query job");

export const GraphqlCancelBulkJobOutputSchema = z
  .object({
    jobId: z.string().optional().describe("Cancelled bulk job ID"),
    status: z.string().optional().describe("Job status after cancellation (expected: CANCELLED)"),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. The job was not cancelled."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `bulk_job_cancelled` + scalar audit summary). Present on a confirmed execute."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `manage` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
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
  // Effect-class write: cancelling a job has no canonical entity snapshot.
  const dispatchedCapability: DispatchedCapability = {
    operation: "manage",
    canonicalEntityKind: null,
  };

  if (input.dry_run === true) {
    return {
      jobId: input.jobId,
      dryRun: buildCancelEffectDryRun(input.jobId),
      dispatchedCapability,
      timestamp: new Date().toISOString(),
    };
  }

  const { ttdService } = resolveSessionServices(sdkContext);

  const result = (await ttdService.graphqlQuery(
    CANCEL_BULK_JOB_MUTATION,
    { input: { jobId: input.jobId } },
    context
  )) as Record<string, any>;

  const errors = result.errors ?? result.data?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const messages = errors.map((e: any) => e.message ?? JSON.stringify(e)).join("; ");
    throw new McpError(JsonRpcErrorCode.InvalidRequest, `GraphQL error: ${messages}`);
  }

  const payload = result.data?.cancelBulkJob ?? result.cancelBulkJob;
  if (!payload) {
    throw new McpError(
      JsonRpcErrorCode.InvalidRequest,
      "GraphQL response contained no cancelBulkJob data"
    );
  }

  const payloadErrors = payload.errors;
  if (Array.isArray(payloadErrors) && payloadErrors.length > 0) {
    const messages = payloadErrors
      .map((e: any) => e.message ?? e.__typename ?? JSON.stringify(e))
      .join("; ");
    throw new McpError(JsonRpcErrorCode.InvalidRequest, `Cannot cancel bulk job: ${messages}`);
  }

  const job = payload.data;
  if (!job) {
    throw new McpError(JsonRpcErrorCode.InvalidRequest, "cancelBulkJob returned no data");
  }

  const jobId = (job.id as string) ?? input.jobId;
  const status = job.status as string;
  const effect: EffectResult = {
    effectKind: "bulk_job_cancelled",
    summary: { job_id: jobId, status },
  };

  return {
    jobId,
    status,
    effect,
    dispatchedCapability,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Symbolic effect dry-run for `graphql_cancel_bulk_job`. TTD exposes no
 * cancellation preview, so validation is symbolic (the job id is required by the
 * input schema). The projected effect is the cancellation of the job. Pure (no
 * I/O) — whether the job is actually cancellable is only known on execute.
 */
function buildCancelEffectDryRun(jobId: string): EffectDryRunResult {
  const expectedEffect: EffectResult = {
    effectKind: "bulk_job_cancelled",
    summary: { job_id: jobId },
  };

  return assertGovernedEffectDryRun(
    {
      wouldSucceed: true,
      validationErrors: [],
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect,
    },
    TOOL_NAME,
    { requiresValidation: true, requiresSimulation: true }
  );
}

export function graphqlCancelBulkJobResponseFormatter(
  result: GraphqlCancelBulkJobOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationSource, expectedEffectSource } = result.dryRun;
    return [
      {
        type: "text" as const,
        text: `Dry run: cancelling bulk job ${result.jobId} ${wouldSucceed ? "would succeed" : "would FAIL"} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). The job was not cancelled.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
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
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "ttd",
      contractPlatformSlug: "ttd",
      contractToolSlug: "graphql_cancel_bulk_job",
      operation: ["manage"],
      entityKinds: [],
      entityIdArgs: ["jobId"],
      schemaVersion: 1,
      contractId: "ttd.graphql_cancel_bulk_job.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
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
