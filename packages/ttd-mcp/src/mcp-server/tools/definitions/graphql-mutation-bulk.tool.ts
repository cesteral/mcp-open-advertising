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
  NO_UNTRUSTED_CONTENT,
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
import {
  MAX_BULK_MUTATION_TOKENS,
  MAX_MUTATION_BULK_INPUTS,
  MUTATION_BULK_PRODUCTION_OPT_IN,
  MUTATION_ERROR_SELECTION,
  countGraphqlLexicalTokens,
  describePayloadErrors,
  mutationBulkProductionRefusal,
} from "../utils/graphql-bulk-job.js";

const TOOL_NAME = "ttd_graphql_mutation_bulk";
const TOOL_TITLE = "TTD GraphQL Mutation Bulk";
const TOOL_DESCRIPTION = `Submit a bulk GraphQL mutation job to The Trade Desk (\`createMutationBulk\`).

Applies one mutation across many input sets as an async bulk job and returns a job ID. Poll the job with \`ttd_graphql_bulk_job\` until it reports \`terminal: true\`.

### ⚠️ Unverified operation, sandbox only by default
No TTD source this server can check shows \`createMutationBulk\`: not its name, its input type, or how an \`inputs\` entry binds to the mutation's variables. TTD's published bulk-write sample uses a different flow (\`bulkCreateCampaigns\` from an uploaded file). So this tool **runs against the TTD sandbox only** (\`TTD_USE_SANDBOX=true\`). Against production it refuses, and its dry run reports \`wouldSucceed: false\`, unless the operator sets \`${MUTATION_BULK_PRODUCTION_OPT_IN}=true\`.

### ⚠️ Not cancellable, no rollback
Treat a submitted job as not cancellable. A job can end **PARTIAL_SUCCESS**: some inputs were applied and some failed, and applied writes are not rolled back, so re-submitting the full input set applies them again. Before retrying, read \`gqlErrors\` and the result file from \`ttd_graphql_bulk_job\`, then re-submit only the failed inputs.

### Constraints
- **Max ${MAX_MUTATION_BULK_INPUTS} inputs** per job (this server's cap while the operation is unverified)
- **Max ${MAX_BULK_MUTATION_TOKENS.toLocaleString("en-US")} GraphQL lexical tokens** in the mutation string, counted as the GraphQL spec defines them
- **Result:** a JSON GraphQL response file (not CSV). Fetch its URL from \`ttd_graphql_bulk_job\` with a plain HTTP GET. Do not use \`ttd_download_report\`, which only parses CSV.

### Mutation names
TTD names mutations entity first, then verb: \`campaignUpdate\`, \`adGroupUpdate\`, \`bidListUpdate\`, \`seedCreate\`. Take input types and payload fields from the TTD GraphQL schema explorer. They are not validated here.

### Example
\`\`\`graphql
mutation UpdateBidList($input: BidListUpdateInput!) {
  bidListUpdate(input: $input) {
    data { id }
    userErrors { field message }
  }
}
\`\`\`
With inputs: \`[{ "id": "bl1", "bidLinesToRemove": [{ "domainFragment": "example.com" }] }, { "id": "bl2", "bidLinesToRemove": [{ "domainFragment": "example.com" }] }]\`

Each \`inputs\` entry is sent as one JSON-encoded element of \`mutationVariables\`. Whether TTD binds an entry to \`$input\` (as this example assumes) or reads it as the full variables map (\`{ "input": { … } }\`) is part of what a sandbox run has to confirm.`;

const CREATE_MUTATION_BULK_MUTATION = `mutation CreateMutationBulk($input: CreateMutationBulkInput!) {
  createMutationBulk(input: $input) {
    data {
      id
      status
    }
    ${MUTATION_ERROR_SELECTION}
  }
}`;

export const GraphqlMutationBulkInputSchema = z
  .object({
    mutation: z.string().min(1).describe("GraphQL mutation string"),
    inputs: z
      .array(z.record(z.any()))
      .min(1)
      .max(MAX_MUTATION_BULK_INPUTS)
      .describe(`Array of input objects, one per entity (max ${MAX_MUTATION_BULK_INPUTS})`),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, returns an EffectDryRunResult under `dryRun` without submitting the job: the expected effect is a bulk mutation job over N inputs, and `wouldSucceed` is false when the tool would refuse to run (production without the operator opt-in). No job is created and no entities are mutated."
      ),
  })
  .superRefine((data, ctx) => {
    const tokens = countGraphqlLexicalTokens(data.mutation);
    if (tokens > MAX_BULK_MUTATION_TOKENS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mutation"],
        message: `Mutation string has ${tokens} GraphQL lexical tokens. TTD's limit for a bulk mutation string is ${MAX_BULK_MUTATION_TOKENS}.`,
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
      .describe(
        "Job status at submission (normally QUEUED). Poll with ttd_graphql_bulk_job; terminal statuses are SUCCESS, PARTIAL_SUCCESS, FAILURE, CANCELLED."
      ),
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
    throw new McpError(
      JsonRpcErrorCode.InvalidRequest,
      `TTD GraphQL bulk mutation failed: ${describePayloadErrors(payloadErrors)}`,
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

  return { id: String(job.id), status: String(job.status) };
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

  const { ttdService } = resolveSessionServices(sdkContext);
  const refusal = mutationBulkProductionRefusal(ttdService.graphqlEndpoint);

  if (input.dry_run === true) {
    return {
      dryRun: buildMutationBulkEffectDryRun(input, refusal),
      dispatchedCapability,
      timestamp: new Date().toISOString(),
    };
  }

  if (refusal) {
    throw new McpError(JsonRpcErrorCode.InvalidRequest, refusal, {
      optIn: MUTATION_BULK_PRODUCTION_OPT_IN,
    });
  }

  // UNVERIFIED binding: no TTD source (the platform samples, or the Workflows SDKs
  // for Python, Go and Java) shows
  // createMutationBulk, its input type, or how a `mutationVariables` entry binds
  // to the mutation's variables. Left as-is pending a sandbox run.
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
 * bulk-job preview. The input schema already enforces the input cap and the
 * token limit, so the one thing left to validate is whether this server would
 * run the job at all: it refuses production without the operator opt-in, and
 * the dry run predicts that refusal rather than promising a success the real
 * call would not deliver. The projected effect is a bulk mutation job over the
 * supplied inputs. No I/O; never includes the raw mutation or input payloads.
 */
function buildMutationBulkEffectDryRun(
  input: GraphqlMutationBulkInput,
  refusal: string | undefined
): EffectDryRunResult {
  const expectedEffect: EffectResult = {
    effectKind: "bulk_job_submitted",
    summary: { job_kind: "mutation", inputs: input.inputs.length },
  };

  return assertGovernedEffectDryRun(
    {
      wouldSucceed: refusal === undefined,
      validationErrors: refusal ? [{ code: "production_not_enabled", message: refusal }] : [],
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
    const reasons = result.dryRun.validationErrors.map((e) => `\n- ${e.message}`).join("");
    return [
      {
        type: "text" as const,
        text: `Dry run: bulk mutation job over ${n} input(s) ${wouldSucceed ? "would be submitted" : "would be REFUSED"} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}).${reasons}\n\nNo job was submitted and no entities were mutated.\n\nTimestamp: ${result.timestamp}`,
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
  // Examples use TTD's documented bidListUpdate shape (input fields `id`,
  // `bidLinesToAdd`/`bidLinesToRemove`, payload `data { id } userErrors { field
  // message }`, from docs/api/ttd_partner_portal_api_docs.md:6062-6082) and the
  // `BidListUpdateInput` type this package already sends (ttd-service.ts
  // updateBidList). The previous `updateCampaign` / `updateAdGroup` examples used
  // verb-first names that TTD's Platform API reference does not list. Its names are
  // `campaignUpdate` / `adGroupUpdate` (docs/api/reference.md:155,331).
  inputExamples: [
    {
      label: "Remove a domain bid line from many bid lists via bulk mutation",
      input: {
        mutation:
          "mutation UpdateBidList($input: BidListUpdateInput!) { bidListUpdate(input: $input) { data { id } userErrors { field message } } }",
        inputs: [
          { id: "bl111aaa", bidLinesToRemove: [{ domainFragment: "example.com" }] },
          { id: "bl222bbb", bidLinesToRemove: [{ domainFragment: "example.com" }] },
          { id: "bl333ccc", bidLinesToRemove: [{ domainFragment: "example.com" }] },
        ],
      },
    },
    {
      label: "Add a domain bid adjustment to many bid lists via bulk mutation",
      input: {
        mutation:
          "mutation UpdateBidList($input: BidListUpdateInput!) { bidListUpdate(input: $input) { data { id } userErrors { field message } } }",
        inputs: [
          {
            id: "bl111aaa",
            bidLinesToAdd: [
              {
                domainFragment: "news.example.com",
                bidAdjustment: 1,
                volumeControlPriority: "NEUTRAL",
              },
            ],
          },
          {
            id: "bl222bbb",
            bidLinesToAdd: [
              {
                domainFragment: "news.example.com",
                bidAdjustment: 1,
                volumeControlPriority: "NEUTRAL",
              },
            ],
          },
        ],
      },
    },
  ],
  logic: graphqlMutationBulkLogic,
  responseFormatter: graphqlMutationBulkResponseFormatter,
  untrustedContent: NO_UNTRUSTED_CONTENT,
};
