// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type GAdsEntityType } from "../utils/entity-mapping.js";
import { addParentValidationIssue } from "../utils/parent-id-validation.js";
import { runGAdsUpdateDryRun, resolveGAdsDispatchedCapability } from "../utils/dry-run.js";
import { captureGAdsSnapshot } from "../utils/capture-snapshot.js";
import {
  DryRunResultSchema,
  NormalizedEntitySnapshotSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext, CesteralWriteToolAnnotations } from "@cesteral/shared";

const TOOL_NAME = "gads_update_entity";
const TOOL_TITLE = "Update Google Ads Entity";
const TOOL_DESCRIPTION = `Update an existing Google Ads entity using the :mutate API with updateMask discipline.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**updateMask is required** — specify which fields to update as a comma-separated string.
Only fields listed in updateMask will be modified. This prevents accidental overwrites.

Example updateMask: "name,status" or "campaignBudget,startDate"

**Composite entityId required for:** \`ad\` → use \`{adGroupId}~{adId}\`, \`keyword\` → use \`{adGroupId}~{criterionId}\`. Other entity types use simple IDs.`;

export const UpdateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to update"),
    customerId: z.string().min(1).describe("Google Ads customer ID (no dashes)"),
    entityId: z.string().min(1).describe("The entity ID to update"),
    data: z.record(z.any()).describe("Entity data fields to update"),
    updateMask: z
      .string()
      .min(1)
      .describe("Comma-separated list of fields to update (e.g., 'name,status')"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the proposed mutation via the Google Ads native `validateOnly` flag and returns a DryRunResult under `dryRun` without applying the mutation. The underlying entity is never modified."
      ),
  })
  .superRefine((input, ctx) => {
    addParentValidationIssue(
      ctx,
      input.entityType as GAdsEntityType,
      input as Record<string, unknown>,
      [],
      { validateCompositeIds: true }
    );
  })
  .describe("Parameters for updating a Google Ads entity");

export const UpdateEntityOutputSchema = z
  .object({
    mutateResult: z.record(z.any()).describe("Mutate operation result"),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. The mutation was NOT applied; `mutateResult` is empty."
    ),
    before: NormalizedEntitySnapshotSchema.optional().describe(
      "Pre-write canonical snapshot of the entity, captured at the start of the handler. Populated when the entity type is in canonical scope (campaign, ad_group, campaign_budget) and the read partner returns the entity. Undefined for out-of-scope types or when the pre-read fails."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-write canonical snapshot of the entity. Captured by re-reading after the write because the Google Ads :mutate endpoint returns only a resourceName. Undefined when the post-read fails or the entity type is out of canonical scope."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to, derived from the `data` payload. Present on every response — dry-run and real write alike."
    ),
  })
  .describe("Entity update result");

type UpdateEntityInput = z.infer<typeof UpdateEntityInputSchema>;
type UpdateEntityOutput = z.infer<typeof UpdateEntityOutputSchema>;

export async function updateEntityLogic(
  input: UpdateEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UpdateEntityOutput> {
  const { gadsService } = resolveSessionServices(sdkContext);

  // The (operation, entityKind) this call resolves to — derived from the
  // `data` payload. Required on every governed response.
  const dispatchedCapability = resolveGAdsDispatchedCapability(input.entityType, input.data);

  if (input.dry_run === true) {
    const dryRun = await runGAdsUpdateDryRun(
      {
        entityType: input.entityType,
        customerId: input.customerId,
        entityId: input.entityId,
        data: input.data,
        updateMask: input.updateMask,
      },
      gadsService,
      context
    );
    return {
      mutateResult: {},
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  // R2-U3: capture pre-state before mutating. Best-effort — out-of-scope
  // entity types and read failures leave `before` undefined and consumers
  // fall back to the read-partner round-trip.
  const before = await captureGAdsSnapshot(
    gadsService,
    input.entityType,
    input.customerId,
    input.entityId,
    context
  );

  const result = await gadsService.updateEntity(
    input.entityType as GAdsEntityType,
    input.customerId,
    input.entityId,
    input.data,
    input.updateMask,
    context
  );

  // R2-U3: the Google Ads :mutate endpoint returns only a resourceName, so we
  // re-read to populate `after`. Same best-effort semantics as `before`.
  const after = await captureGAdsSnapshot(
    gadsService,
    input.entityType,
    input.customerId,
    input.entityId,
    context
  );

  return {
    mutateResult: result as Record<string, any>,
    timestamp: new Date().toISOString(),
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    dispatchedCapability,
  };
}

export function updateEntityResponseFormatter(result: UpdateEntityOutput): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedStateSource } = result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errorLines = validationErrors.length
      ? "\n" + validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n")
      : "";
    return [
      {
        type: "text" as const,
        text: `Dry run: mutation ${verdict} (validation: ${validationSource}, expected-state: ${expectedStateSource}). The entity was NOT modified.${errorLines}\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Entity updated successfully\n${JSON.stringify(result.mutateResult, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const updateEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UpdateEntityInputSchema,
  outputSchema: UpdateEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: false,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "google_ads",
      contractPlatformSlug: "google_ads",
      contractToolSlug: "update_entity",
      // `gads_update_entity` is a multi-operation dispatcher: callers change
      // status, budget, name, etc. via the `data` + `updateMask` payload, so
      // the contract advertises every canonical op it can express.
      operation: ["update_budget", "pause", "resume", "update_status", "update"],
      // Governed scope is campaign / ad_group / campaign_budget — the kinds
      // that round-trip cleanly through the read partner and carry a canonical
      // status/budget snapshot. `ad` and `keyword` use composite IDs
      // (`{adGroupId}~{adId}`) that the read partner's simple-ID GAQL lookup
      // cannot resolve, and `asset` is create-only with no canonical kind;
      // all three are intentionally out of governed scope.
      entityKinds: ["campaign", "ad_group", "campaign_budget"],
      entityIdArgs: ["customerId", "entityId"],
      readPartner: {
        toolName: "gads_get_entity",
        argMap: { entityType: "entityType", customerId: "customerId", entityId: "entityId" },
      },
      schemaVersion: 1,
      contractId: "google_ads.update_entity.v1",
      // R2-U3: `dry_run` is wired via the Google Ads native `validateOnly`
      // flag (validation) plus symbolic apply over the read partner (expected
      // post-state). `before` / `after` are captured by reading the entity
      // pre-write and re-reading post-write (the :mutate endpoint returns
      // only a resourceName).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      // Contract promises the governance admission layer requires.
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Update campaign name",
      input: {
        entityType: "campaign",
        customerId: "1234567890",
        entityId: "123456",
        data: { name: "Updated Campaign Name" },
        updateMask: "name",
      },
    },
    {
      label: "Pause an ad group",
      input: {
        entityType: "adGroup",
        customerId: "1234567890",
        entityId: "789012",
        data: { status: "PAUSED" },
        updateMask: "status",
      },
    },
  ],
  logic: updateEntityLogic,
  responseFormatter: updateEntityResponseFormatter,
};
