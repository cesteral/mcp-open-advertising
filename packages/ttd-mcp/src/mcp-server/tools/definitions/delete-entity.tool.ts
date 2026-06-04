// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type TtdEntityType } from "../utils/entity-mapping.js";
import { addParentValidationIssue } from "../utils/parent-id-validation.js";
import { runTtdDeleteDryRun, resolveTtdDeleteCapability } from "../utils/dry-run.js";
import {
  buildTtdSnapshot,
  ENTITY_KIND_MAP,
  type TtdServiceLike,
} from "../utils/capture-snapshot.js";
import {
  elicitDeleteConfirmation,
  DryRunResultSchema,
  NormalizedEntitySnapshotSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  McpTextContent,
  RequestContext,
  SdkContext,
  NormalizedEntitySnapshot,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "ttd_delete_entity";
const TOOL_TITLE = "Delete TTD Entity";
const TOOL_DESCRIPTION = `Retire a The Trade Desk entity by ID (sets Availability="Archived").

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

TTD's Platform API has no REST hard-delete for these entity types — the data model uses Availability="Archived" as the end-state for retired entities. This tool delegates to the same archive operation as \`ttd_archive_entities\` for a single ID. Archived entities are hidden from default queries but historical reporting still resolves their IDs.

Warning: Archive is the platform's final state; in practice it cannot be reversed via this server.`;

export const DeleteEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to delete"),
    entityId: z.string().min(1).describe("The entity ID to delete"),
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID (required for most non-advertiser entities)"),
    campaignId: z.string().optional().describe("Campaign ID (required for adGroup)"),
    adGroupId: z
      .string()
      .optional()
      .describe("Ad Group ID (not currently required for any entity type)"),
    reason: z.string().optional().describe("Reason for deletion (for audit logging)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the deletion and returns a DryRunResult under `dryRun` (expected post-state = the entity with canonical status `archived`) without calling the TTD API. The entity is never archived."
      ),
  })
  .superRefine((input, ctx) => {
    addParentValidationIssue(
      ctx,
      input.entityType as TtdEntityType,
      input as Record<string, unknown>
    );
  })
  .describe("Parameters for deleting a TTD entity");

export const DeleteEntityOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    success: z.boolean(),
    entityType: z.string(),
    entityId: z.string(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. The entity was NOT archived."
    ),
    before: NormalizedEntitySnapshotSchema.optional().describe(
      "Pre-delete canonical snapshot, captured before the archive. Populated for in-scope entity kinds (campaign, ad_group) when the read partner returns the entity."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      'Post-delete canonical snapshot — the pre-delete entity with canonical status `archived` (TTD retires entities via Availability="Archived"). Undefined for out-of-scope kinds or read failures.'
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to. Present on every response — dry-run, decline, and real archive alike."
    ),
  })
  .describe("Entity deletion result");

type DeleteEntityInput = z.infer<typeof DeleteEntityInputSchema>;
type DeleteEntityOutput = z.infer<typeof DeleteEntityOutputSchema>;

async function readTtdEntityRaw(
  ttdService: TtdServiceLike,
  entityType: string,
  entityId: string,
  context: RequestContext
): Promise<Record<string, unknown> | undefined> {
  if (!ENTITY_KIND_MAP[entityType] || !ttdService.getEntity) return undefined;
  try {
    const current = (await ttdService.getEntity(entityType, entityId, context)) as
      | Record<string, unknown>
      | undefined;
    return current && typeof current === "object" ? current : undefined;
  } catch {
    return undefined;
  }
}

export async function deleteEntityLogic(
  input: DeleteEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DeleteEntityOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolveTtdDeleteCapability(input.entityType);

  // Dry-run never mutates and never prompts for confirmation.
  if (input.dry_run === true) {
    const dryRun = await runTtdDeleteDryRun(
      { entityType: input.entityType, entityId: input.entityId },
      ttdService,
      context
    );
    return {
      confirmed: true,
      success: dryRun.wouldSucceed,
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
      success: false,
      entityType: input.entityType,
      entityId: input.entityId,
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  // Capture pre-delete raw state once; reused to build both `before` and the
  // symbolic `after` (the entity with canonical status `archived`).
  const beforeRaw = await readTtdEntityRaw(ttdService, input.entityType, input.entityId, context);
  const before: NormalizedEntitySnapshot | undefined = beforeRaw
    ? (buildTtdSnapshot(input.entityType, input.entityId, beforeRaw, {}) ?? undefined)
    : undefined;

  await ttdService.deleteEntity(input.entityType as TtdEntityType, input.entityId, context);

  const after: NormalizedEntitySnapshot | undefined = beforeRaw
    ? (buildTtdSnapshot(input.entityType, input.entityId, beforeRaw, {
        Availability: "Archived",
      }) ?? undefined)
    : undefined;

  return {
    confirmed: true,
    success: true,
    entityType: input.entityType,
    entityId: input.entityId,
    timestamp: new Date().toISOString(),
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    dispatchedCapability,
  };
}

export function deleteEntityResponseFormatter(result: DeleteEntityOutput): McpTextContent[] {
  if (result.dryRun) {
    const outcome = result.dryRun.wouldSucceed ? "would succeed" : "would FAIL";
    return [
      {
        type: "text" as const,
        text: `Dry-run: archiving ${result.entityType} ${result.entityId} ${outcome}.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Deletion of ${result.entityType} ${result.entityId} cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Entity deleted: ${result.entityType} ${result.entityId}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const deleteEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: DeleteEntityInputSchema,
  outputSchema: DeleteEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: false,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "ttd",
      contractPlatformSlug: "ttd",
      contractToolSlug: "delete_entity",
      operation: ["delete"],
      // Governed scope is the canonical entity kinds (campaign / ad_group).
      // creative / advertiser / conversionTracker are deletable but out of scope.
      entityKinds: ["campaign", "ad_group"],
      entityIdArgs: ["entityId"],
      readPartner: {
        toolName: "ttd_get_entity",
        argMap: { entityId: "entityId" },
      },
      schemaVersion: 1,
      contractId: "ttd.delete_entity.v1",
      // `dry_run` = symbolic validate + symbolic apply (expected post-state is the
      // entity with canonical status `archived`). before/after captured via the
      // read partner around the real archive.
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Delete a creative",
      input: {
        entityType: "creative",
        entityId: "cre001xyz",
        advertiserId: "adv123abc",
        reason: "Creative no longer needed after campaign end",
      },
    },
  ],
  logic: deleteEntityLogic,
  responseFormatter: deleteEntityResponseFormatter,
};
