// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type GAdsEntityType } from "../utils/entity-mapping.js";
import { addParentValidationIssue } from "../utils/parent-id-validation.js";
import { runGAdsRemoveDryRun, resolveGAdsRemoveCapability } from "../utils/dry-run.js";
import { captureGAdsSnapshot } from "../utils/capture-snapshot.js";
import {
  elicitDeleteConfirmation,
  DryRunResultSchema,
  NormalizedEntitySnapshotSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  RequestContext,
  McpTextContent,
  SdkContext,
  NormalizedEntitySnapshot,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "gads_remove_entity";
const TOOL_TITLE = "Remove Google Ads Entity";
const TOOL_DESCRIPTION = `Remove a Google Ads entity using the :mutate API.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**Warning**: This is a destructive operation. For campaigns and ad groups, consider using \`gads_bulk_update_status\` with status \`PAUSED\` instead of removing.

Note: In Google Ads, "remove" sets the entity status to REMOVED. The entity data is retained but the entity becomes inactive and cannot be re-enabled.

**Composite entityId required for:** \`ad\` → use \`{adGroupId}~{adId}\`, \`keyword\` → use \`{adGroupId}~{criterionId}\`. Other entity types use simple IDs.`;

export const RemoveEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to remove"),
    customerId: z.string().min(1).describe("Google Ads customer ID (no dashes)"),
    entityId: z.string().min(1).describe("The entity ID to remove"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the removal and returns a DryRunResult under `dryRun` (expected post-state = the entity with canonical status `deleted`, i.e. Google Ads REMOVED) without calling the :mutate API. The entity is never removed."
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
  .describe("Parameters for removing a Google Ads entity");

export const RemoveEntityOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    mutateResult: z.record(z.any()).describe("Mutate operation result"),
    entityType: z.string(),
    entityId: z.string(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. The entity was NOT removed."
    ),
    before: NormalizedEntitySnapshotSchema.optional().describe(
      "Pre-remove canonical snapshot (in-scope kinds: campaign, ad_group, campaign_budget), captured before the :mutate."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-remove canonical snapshot, re-read after removal (status REMOVED → canonical `deleted`). Undefined for out-of-scope kinds or read failures."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to. Present on every response."
    ),
  })
  .describe("Entity removal result");

type RemoveEntityInput = z.infer<typeof RemoveEntityInputSchema>;
type RemoveEntityOutput = z.infer<typeof RemoveEntityOutputSchema>;

export async function removeEntityLogic(
  input: RemoveEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<RemoveEntityOutput> {
  const { gadsService } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolveGAdsRemoveCapability(input.entityType);

  // Dry-run never mutates and never prompts for confirmation.
  if (input.dry_run === true) {
    const dryRun = await runGAdsRemoveDryRun(
      { entityType: input.entityType, customerId: input.customerId, entityId: input.entityId },
      gadsService,
      context
    );
    return {
      confirmed: true,
      mutateResult: {},
      entityType: input.entityType,
      entityId: input.entityId,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const confirmed = await elicitDeleteConfirmation({
    entityLabel: input.entityType,
    entityId: input.entityId,
    sdkContext,
  });
  if (!confirmed) {
    return {
      confirmed: false,
      declineReason: "user_declined",
      mutateResult: {},
      entityType: input.entityType,
      entityId: input.entityId,
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  // Capture pre-state (best-effort; undefined for out-of-scope kinds).
  const before: NormalizedEntitySnapshot | undefined = await captureGAdsSnapshot(
    gadsService,
    input.entityType,
    input.customerId,
    input.entityId,
    context
  );

  const result = await gadsService.removeEntity(
    input.entityType as GAdsEntityType,
    input.customerId,
    input.entityId,
    context
  );

  // Google Ads retains REMOVED entities, so a re-read reflects the new status
  // (REMOVED → canonical `deleted`). Best-effort.
  const after: NormalizedEntitySnapshot | undefined = await captureGAdsSnapshot(
    gadsService,
    input.entityType,
    input.customerId,
    input.entityId,
    context
  );

  return {
    confirmed: true,
    mutateResult: result as Record<string, any>,
    entityType: input.entityType,
    entityId: input.entityId,
    timestamp: new Date().toISOString(),
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    dispatchedCapability,
  };
}

export function removeEntityResponseFormatter(result: RemoveEntityOutput): McpTextContent[] {
  if (result.dryRun) {
    const outcome = result.dryRun.wouldSucceed ? "would succeed" : "would FAIL";
    const errs = result.dryRun.validationErrors.map((e) => e.message).join("; ");
    return [
      {
        type: "text" as const,
        text:
          `Dry-run: removing ${result.entityType} ${result.entityId} ${outcome}.` +
          (errs ? `\nValidation: ${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Removal of ${result.entityType} ${result.entityId} cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Entity removed: ${result.entityType} ${result.entityId}\n${JSON.stringify(result.mutateResult, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const removeEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: RemoveEntityInputSchema,
  outputSchema: RemoveEntityOutputSchema,
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
      contractToolSlug: "remove_entity",
      operation: ["delete"],
      // Governed scope is the canonical kinds. ad / keyword (composite IDs) are
      // removable but resolve canonicalEntityKind:null — still token-gated.
      entityKinds: ["campaign", "ad_group", "campaign_budget"],
      entityIdArgs: ["customerId", "entityId"],
      readPartner: {
        toolName: "gads_get_entity",
        argMap: { entityType: "entityType", customerId: "customerId", entityId: "entityId" },
      },
      schemaVersion: 1,
      contractId: "google_ads.remove_entity.v1",
      // `dry_run` = symbolic apply (expected post-state = entity with canonical
      // status `deleted`, i.e. Google Ads REMOVED). before/after via the read
      // partner (Google Ads retains REMOVED entities, so the post-read works).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Remove a keyword",
      input: {
        entityType: "keyword",
        customerId: "1234567890",
        entityId: "5555555555~6666666666",
      },
    },
    {
      label: "Remove an ad",
      input: {
        entityType: "ad",
        customerId: "1234567890",
        entityId: "7777777777~8888888888",
      },
    },
    {
      label: "Remove a campaign budget",
      input: {
        entityType: "campaignBudget",
        customerId: "1234567890",
        entityId: "9999999999",
      },
    },
  ],
  logic: removeEntityLogic,
  responseFormatter: removeEntityResponseFormatter,
};
