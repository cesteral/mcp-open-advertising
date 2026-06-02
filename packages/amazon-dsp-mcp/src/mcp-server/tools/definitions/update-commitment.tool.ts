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
  type DSPCommitmentT,
  type DSPCommitmentUpdateT,
} from "../../../services/amazon-dsp/v1-schemas.js";
import {
  buildCommitmentSnapshot,
  captureCommitmentSnapshot,
  resolveCommitmentDispatchedCapability,
  runCommitmentUpdateDryRun,
} from "../utils/commitment-dry-run.js";

const TOOL_NAME = "amazon_dsp_update_commitment";
const TOOL_TITLE = "Update an Amazon DSP commitment";
const TOOL_DESCRIPTION = `Update a single committed-spend agreement. Only fields included in
\`data\` are sent to Amazon; the underlying endpoint replaces those fields
and leaves the rest as-is.

Governed write: pre-write snapshot is captured through the
\`amazon_dsp_get_commitment\` read partner, the patch is symbolically
validated, and the response carries canonical \`before\` / \`after\` /
\`dispatchedCapability\` blocks so the governance control plane can audit
the change without an out-of-band pairing.

When \`dry_run: true\` the call returns a \`dryRun\` payload (symbolic
validation + symbolic post-state) without touching the commitment.`;

/**
 * Patch shape for the `data` field. Mirrors DSPCommitmentUpdate from the spec
 * but explicitly drops the required `commitmentId` — that field is sourced
 * from the top-level input arg so callers cannot smuggle a conflicting ID.
 *
 * `.passthrough()` accepts forward-compatible fields Amazon may add without
 * us regenerating. The `superRefine` forbids `commitmentId` in `data`
 * explicitly so a stale caller is surfaced with a clear error instead of
 * silently overwritten.
 */
export const CommitmentUpdatePatchSchema = z
  .object({
    advertiserIds: z.array(z.string().min(1)).max(1000).optional(),
    campaignIds: z.array(z.string().min(1)).max(1000).optional(),
    commitmentName: z.string().min(1).optional(),
    committedSpend: z.number().optional(),
    currencyCode: z.string().min(1).optional(),
    dealIds: z.array(z.string().min(1)).max(1000).optional(),
    endDateTime: z.string().datetime({ offset: true }).optional(),
    fulfillmentLevel: z.enum(["LEVEL_0", "LEVEL_5"]).optional(),
    spendCalculationMode: z.enum(["ADVERTISER_ACCOUNT", "CAMPAIGN", "MANAGER_ACCOUNT"]).optional(),
    startDateTime: z.string().datetime({ offset: true }).optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (
      "commitmentId" in value &&
      (value as { commitmentId?: unknown }).commitmentId !== undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "data.commitmentId is forbidden — pass `commitmentId` at the top level of the tool input instead.",
        path: ["commitmentId"],
      });
    }
  })
  .describe(
    "Fields to update (partial). All keys are optional. Pass `commitmentId` at the top level, not here."
  );

export const UpdateCommitmentInputSchema = z
  .object({
    profileId: z.string().min(1).describe("Amazon DSP Profile ID"),
    commitmentId: z.string().min(1).describe("The commitment ID to update"),
    data: CommitmentUpdatePatchSchema,
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the proposed mutation and returns a DryRunResult under `dryRun` without invoking the Amazon DSP API. The underlying commitment is never modified."
      ),
  })
  .describe("Parameters for updating an Amazon DSP commitment");

export const UpdateCommitmentOutputSchema = z
  .object({
    commitmentId: z.string(),
    updated: z.boolean(),
    timestamp: z.string().datetime(),
    commitment: DSPCommitmentSchema.optional().describe(
      "Updated commitment as returned by Amazon (real writes only)"
    ),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. The mutation was NOT applied."
    ),
    before: NormalizedEntitySnapshotSchema.optional().describe(
      "Pre-write canonical snapshot, captured via the read partner. Undefined when the pre-read fails."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-write canonical snapshot, normalised from the commitment returned by the update endpoint."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The (operation, entityKind) this call resolved to. Present on every response — dry-run and real write alike."
    ),
  })
  .describe("Commitment update result");

type UpdateCommitmentInput = z.infer<typeof UpdateCommitmentInputSchema>;
type UpdateCommitmentOutput = z.infer<typeof UpdateCommitmentOutputSchema>;

export async function updateCommitmentLogic(
  input: UpdateCommitmentInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UpdateCommitmentOutput> {
  const { amazonDspV1Service } = resolveSessionServices(sdkContext);

  const dispatchedCapability = resolveCommitmentDispatchedCapability();

  if (input.dry_run === true) {
    const dryRun = await runCommitmentUpdateDryRun(
      {
        commitmentId: input.commitmentId,
        profileId: input.profileId,
        data: input.data as DSPCommitmentUpdateT,
      },
      amazonDspV1Service,
      context
    );
    return {
      commitmentId: input.commitmentId,
      updated: false,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  // Best-effort pre-state capture. A read failure leaves `before` undefined
  // (mirrors update_entity behavior); the write still proceeds because a
  // missing pre-snapshot is non-fatal for the governance contract.
  const before = await captureCommitmentSnapshot(
    amazonDspV1Service,
    input.commitmentId,
    input.profileId,
    context
  );

  // Spread `data` first, then pin commitmentId from the top-level input —
  // the top-level field is the authoritative ID; any value smuggled into
  // `data.commitmentId` is ignored.
  const updated = (await amazonDspV1Service.updateCommitment(
    { ...input.data, commitmentId: input.commitmentId } as DSPCommitmentUpdateT,
    context
  )) as DSPCommitmentT;

  // The Amazon DSP update endpoint returns the full updated commitment in
  // success[0].commitment (already unwrapped by the service layer). Normalise
  // it directly — same pattern as snapshotFromAmazonDspEntity.
  const after = buildCommitmentSnapshot(input.commitmentId, input.profileId, updated, {});

  return {
    commitmentId: input.commitmentId,
    updated: true,
    commitment: updated,
    timestamp: new Date().toISOString(),
    ...(before ? { before } : {}),
    after,
    dispatchedCapability,
  };
}

export function updateCommitmentResponseFormatter(
  result: UpdateCommitmentOutput
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
        text: `Dry run: commitment update ${verdict} (validation: ${validationSource}, expected-state: ${expectedStateSource}). The commitment was NOT modified.${errorLines}\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Commitment ${result.commitmentId} updated successfully\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const updateCommitmentTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UpdateCommitmentInputSchema,
  outputSchema: UpdateCommitmentOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "amazon_dsp",
      contractPlatformSlug: "amazon_dsp",
      contractToolSlug: "update_commitment",
      // Single-operation tool: dispatcher always resolves to "update". No
      // status / budget / schedule sub-operations on the v1 commitment
      // surface — the endpoint takes a partial DSPCommitmentUpdate as one
      // unit.
      operation: ["update"],
      entityKinds: ["commitment"],
      entityIdArgs: ["commitmentId"],
      readPartner: {
        toolName: "amazon_dsp_get_commitment",
        argMap: { profileId: "profileId", commitmentId: "commitmentId" },
      },
      schemaVersion: 1,
      contractId: "amazon_dsp.update_commitment.v1",
      // Amazon's v1 commitment update endpoint exposes no native preview;
      // dry-run is symbolic apply (validation + post-state via read partner
      // + shallow patch merge). before/after are captured pre-write and
      // normalised from the commitment the update endpoint returns.
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Increase committed spend",
      input: {
        profileId: "1234567890",
        commitmentId: "c-001",
        data: { committedSpend: 150000 },
      },
    },
    {
      label: "Dry run a name change",
      input: {
        profileId: "1234567890",
        commitmentId: "c-001",
        data: { commitmentName: "Q3 Upfront (revised)" },
        dry_run: true,
      },
    },
  ],
  logic: updateCommitmentLogic,
  responseFormatter: updateCommitmentResponseFormatter,
};
