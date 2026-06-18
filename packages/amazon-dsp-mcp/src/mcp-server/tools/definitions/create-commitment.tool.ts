// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import type {
  RequestContext,
  McpTextContent,
  SdkContext,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";
import {
  DryRunResultSchema,
  NormalizedEntitySnapshotSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  DSPCommitmentSchema,
  DSPCommitmentCreateSchema,
  type DSPCommitmentCreateT,
  type DSPCommitmentT,
} from "../../../services/amazon-dsp/v1-schemas.js";
import {
  buildCommitmentSnapshot,
  resolveCommitmentCreateDispatchedCapability,
  runCommitmentCreateDryRun,
} from "../utils/commitment-dry-run.js";

const TOOL_NAME = "amazon_dsp_create_commitment";
const TOOL_TITLE = "Create an Amazon DSP commitment";
const TOOL_DESCRIPTION = `Create a new committed-spend agreement on the authenticated DSP account.

Single-commitment write. Internally wraps the input into a 1-element
\`commitments\` batch and unwraps \`success[0].commitment\` from Amazon's
multi-status response. Per-item rejections surface as
McpError(InvalidParams) with the original Amazon ErrorCode + fieldLocation.

Governed write (entity class): the create payload is symbolically validated,
and the response carries an \`after\` canonical snapshot (a create has no
\`before\`) plus \`dispatchedCapability\`. When \`dry_run: true\` the call returns
a \`dryRun\` payload (symbolic validation + symbolic post-state) without creating
anything.`;

export const CreateCommitmentInputSchema = z
  .object({
    profileId: z.string().min(1).describe("Amazon DSP Profile ID"),
    data: DSPCommitmentCreateSchema.describe(
      "Commitment definition (required fields per the DSP spec)"
    ),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the proposed create and returns a DryRunResult under `dryRun` without invoking the Amazon DSP API. No commitment is created."
      ),
  })
  .describe("Parameters for creating an Amazon DSP commitment");

export const CreateCommitmentOutputSchema = z
  .object({
    commitment: DSPCommitmentSchema.optional().describe(
      "The created commitment as returned by Amazon (real writes only)"
    ),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No commitment was created."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-create canonical snapshot, normalised from the commitment the create endpoint returns. A create has no `before`."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The (operation, entityKind) this call resolved to — `create` of a `commitment`. Present on every response."
    ),
  })
  .describe("Create commitment result");

type CreateCommitmentInput = z.infer<typeof CreateCommitmentInputSchema>;
type CreateCommitmentOutput = z.infer<typeof CreateCommitmentOutputSchema>;

export async function createCommitmentLogic(
  input: CreateCommitmentInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateCommitmentOutput> {
  const dispatchedCapability = resolveCommitmentCreateDispatchedCapability();

  if (input.dry_run === true) {
    return {
      timestamp: new Date().toISOString(),
      dryRun: runCommitmentCreateDryRun({
        profileId: input.profileId,
        data: input.data as Record<string, unknown>,
      }),
      dispatchedCapability,
    };
  }

  const { amazonDspV1Service } = resolveSessionServices(sdkContext);
  const commitment = (await amazonDspV1Service.createCommitment(
    input.data as DSPCommitmentCreateT,
    context
  )) as DSPCommitmentT;

  // Normalise the created commitment into the canonical `after` snapshot
  // (a create has no `before`). The id comes from Amazon's response.
  const createdId =
    typeof (commitment as Record<string, unknown>).commitmentId === "string"
      ? ((commitment as Record<string, unknown>).commitmentId as string)
      : "(unknown)";
  const after = buildCommitmentSnapshot(createdId, input.profileId, commitment, {});

  return {
    commitment,
    timestamp: new Date().toISOString(),
    after,
    dispatchedCapability,
  };
}

export function createCommitmentResponseFormatter(
  result: CreateCommitmentOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedStateSource } = result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errorLines = validationErrors.length
      ? "\n" + validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n")
      : "";
    return [
      {
        type: "text" as const,
        text: `Dry run: commitment create ${verdict} (validation: ${validationSource}, expected-state: ${expectedStateSource}). No commitment was created.${errorLines}\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Commitment created\n${JSON.stringify(result.commitment, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const createCommitmentTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CreateCommitmentInputSchema,
  outputSchema: CreateCommitmentOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: true,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "amazon_dsp",
      contractPlatformSlug: "amazon_dsp",
      contractToolSlug: "create_commitment",
      operation: ["create"],
      entityKinds: ["commitment"],
      // `profileId` is the required top-level scope arg (also mapped in the
      // readPartner below). A create has no pre-existing commitment id; the
      // contract allows an empty entityIdArgs for creates, but we declare the
      // real scope arg we do have.
      entityIdArgs: ["profileId"],
      readPartner: {
        // A create has no commitment id to pass; the `after` snapshot is read
        // by the id Amazon returns. The read partner therefore only resolves
        // the profile scope from the manifest — same shape as create_entity.
        toolName: "amazon_dsp_get_commitment",
        argMap: { profileId: "profileId" },
      },
      schemaVersion: 1,
      contractId: "amazon_dsp.create_commitment.v1",
      // Amazon's v1 create endpoint exposes no native preview; dry-run is
      // symbolic (validation + symbolic post-state projected from the input).
      // `after` is normalised from the created commitment; a create has no
      // `before`.
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Create a Q3 upfront commitment",
      input: {
        profileId: "1234567890",
        data: {
          commitmentName: "Q3 Upfront 2026",
          committedSpend: 100000,
          currencyCode: "USD",
          startDateTime: "2026-07-01T00:00:00+00:00",
          endDateTime: "2026-09-30T23:59:59+00:00",
          fulfillmentLevel: "LEVEL_5",
          spendCalculationMode: "CAMPAIGN",
        },
      },
    },
  ],
  logic: createCommitmentLogic,
  responseFormatter: createCommitmentResponseFormatter,
};
