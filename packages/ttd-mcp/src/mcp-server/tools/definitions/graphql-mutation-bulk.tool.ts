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
    data {
      id
      status
    }
    errors {
      __typename
    }
  }
}`;

export const GraphqlMutationBulkInputSchema = z
  .object({
    mutation: z.string().min(1).describe("GraphQL mutation string"),
    inputs: z
      .array(z.record(z.any()))
      .min(1)
      .max(1000)
      .describe("Array of input objects — one per entity (max 1000)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the bulk mutation request and returns an EffectDryRunResult under `dryRun` (expected effect = a bulk mutation job over N inputs) without submitting the job. No job is created and no entities are mutated."
      ),
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
    jobId: z.string().optional().describe("Bulk job ID for polling status"),
    status: z
      .string()
      .optional()
      .describe("Job status (QUEUED, RUNNING, SUCCESS, FAILURE, CANCELLED)"),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No job was submitted and no entities were mutated."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `bulk_job_submitted` + scalar audit summary). Present on a confirmed execute."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `bulk_job` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
    timestamp: z.string().datetime(),
  })
  .describe("Bulk mutation job submission result");

type GraphqlMutationBulkInput = z.infer<typeof GraphqlMutationBulkInputSchema>;
type GraphqlMutationBulkOutput = z.infer<typeof GraphqlMutationBulkOutputSchema>;

function extractMutationBulkJobOrThrow(result: Record<string, any>): {
  id: string;
  status: string;
} {
  const errors = result.errors ?? result.data?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const messages = errors.map((e: any) => e.message ?? JSON.stringify(e)).join("; ");
    throw new McpError(
      JsonRpcErrorCode.InvalidRequest,
      `TTD GraphQL bulk mutation failed: ${messages}`,
      { errors }
    );
  }

  const payload = result.data?.createMutationBulk ?? result.createMutationBulk;
  const payloadErrors = payload?.errors;
  if (Array.isArray(payloadErrors) && payloadErrors.length > 0) {
    const messages = payloadErrors
      .map((e: any) => e.message ?? e.__typename ?? JSON.stringify(e))
      .join("; ");
    throw new McpError(
      JsonRpcErrorCode.InvalidRequest,
      `TTD GraphQL bulk mutation failed: ${messages}`,
      { errors: payloadErrors }
    );
  }

  const job = payload?.data;
  if (!job?.id || !job?.status) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      "TTD GraphQL bulk mutation response did not include createMutationBulk.data.id/status",
      { result }
    );
  }

  return { id: job.id as string, status: job.status as string };
}

export async function graphqlMutationBulkLogic(
  input: GraphqlMutationBulkInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GraphqlMutationBulkOutput> {
  // Effect-class write: a bulk job submission has no canonical entity snapshot.
  const dispatchedCapability: DispatchedCapability = {
    operation: "bulk_job",
    canonicalEntityKind: null,
  };

  if (input.dry_run === true) {
    return {
      dryRun: buildMutationBulkEffectDryRun(input),
      dispatchedCapability,
      timestamp: new Date().toISOString(),
    };
  }

  const { ttdService } = resolveSessionServices(sdkContext);

  const variables = {
    input: {
      mutation: input.mutation,
      mutationVariables: input.inputs.map((v) => JSON.stringify(v)),
    },
  };

  const result = (await ttdService.graphqlQuery(
    CREATE_MUTATION_BULK_MUTATION,
    variables,
    context
  )) as Record<string, any>;

  const job = extractMutationBulkJobOrThrow(result);

  // Effect summary carries audit identity only (job id/status + count) — never
  // the raw mutation string or input payloads.
  const effect: EffectResult = {
    effectKind: "bulk_job_submitted",
    summary: {
      job_kind: "mutation",
      job_id: job.id,
      status: job.status,
      inputs: input.inputs.length,
    },
  };

  return {
    jobId: job.id,
    status: job.status,
    effect,
    dispatchedCapability,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Symbolic effect dry-run for `graphql_mutation_bulk`. TTD has no native
 * bulk-job preview; validation is symbolic (input-schema invariants — ≤1000
 * inputs, mutation ≤15k tokens — are already enforced, so a well-formed call
 * always passes). The projected effect is a bulk mutation job over the supplied
 * inputs. Pure (no I/O); never includes the raw mutation or input payloads.
 */
function buildMutationBulkEffectDryRun(input: GraphqlMutationBulkInput): EffectDryRunResult {
  const expectedEffect: EffectResult = {
    effectKind: "bulk_job_submitted",
    summary: { job_kind: "mutation", inputs: input.inputs.length },
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

export function graphqlMutationBulkResponseFormatter(
  result: GraphqlMutationBulkOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationSource, expectedEffectSource } = result.dryRun;
    const n = result.dryRun.expectedEffect?.summary.inputs ?? 0;
    return [
      {
        type: "text" as const,
        text: `Dry run: bulk mutation job over ${n} input(s) ${wouldSucceed ? "would succeed" : "would FAIL"} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No job was submitted and no entities were mutated.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
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
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "ttd",
      contractPlatformSlug: "ttd",
      contractToolSlug: "graphql_mutation_bulk",
      operation: ["bulk_job"],
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "ttd.graphql_mutation_bulk.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Batch update campaign names via bulk mutation",
      input: {
        mutation:
          "mutation UpdateCampaign($input: UpdateCampaignInput!) { updateCampaign(input: $input) { campaign { campaignId name } } }",
        inputs: [
          { campaignId: "camp456def", name: "Q1 2025 Brand Awareness - Updated" },
          { campaignId: "camp789ghi", name: "Q1 2025 Retargeting - Updated" },
          { campaignId: "camp012jkl", name: "Q1 2025 Prospecting - Updated" },
        ],
      },
    },
    {
      label: "Batch update ad group bids via bulk mutation",
      input: {
        mutation:
          "mutation UpdateAdGroup($input: UpdateAdGroupInput!) { updateAdGroup(input: $input) { adGroup { adGroupId baseBidCPM { amount } } } }",
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
