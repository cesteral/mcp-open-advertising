// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum } from "../utils/entity-mapping.js";
import { runMetaDeleteDryRun, resolveMetaDeleteCapability } from "../utils/dry-run.js";
import {
  buildMetaSnapshot,
  ENTITY_KIND_MAP,
  type MetaServiceLike,
} from "../utils/capture-snapshot.js";
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

const TOOL_NAME = "meta_delete_entity";
const TOOL_TITLE = "Delete Meta Ads Entity";
const TOOL_DESCRIPTION = `Delete a Meta Ads entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Uses DELETE /{entityId}.

**Gotchas:**
- ACTIVE entities must be paused before deletion.
- For campaigns, setting status to ARCHIVED is often preferred over deletion.
- ARCHIVED status is permanent and cannot be reversed.
- Writes are rate-limited at 3x read cost.`;

export const DeleteEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to delete"),
    entityId: z.string().min(1).describe("The entity ID to delete"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the deletion and returns a DryRunResult under `dryRun` (expected post-state = the entity with canonical status `deleted`) without calling the Meta Graph API. The entity is never deleted."
      ),
  })
  .describe("Parameters for deleting a Meta Ads entity");

export const DeleteEntityOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    success: z.boolean(),
    entityId: z.string(),
    entityType: z.string(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. The entity was NOT deleted."
    ),
    before: NormalizedEntitySnapshotSchema.optional().describe(
      "Pre-delete canonical snapshot, captured before the delete. Populated for in-scope entity kinds (campaign, ad_set, ad) when the read partner returns the entity."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-delete canonical snapshot — the pre-delete entity with canonical status `deleted` (Meta's delete endpoint returns only `{ success: true }` and a re-read 404s). Undefined for out-of-scope kinds or read failures."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to. Present on every response — dry-run, decline, and real delete alike."
    ),
  })
  .describe("Entity deletion result");

type DeleteEntityInput = z.infer<typeof DeleteEntityInputSchema>;
type DeleteEntityOutput = z.infer<typeof DeleteEntityOutputSchema>;

async function readMetaEntityRaw(
  metaService: MetaServiceLike,
  entityType: string,
  entityId: string,
  context: RequestContext
): Promise<Record<string, unknown> | undefined> {
  if (!ENTITY_KIND_MAP[entityType] || !metaService.getEntity) return undefined;
  try {
    const current = (await metaService.getEntity(entityType, entityId, undefined, context)) as
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
  const { metaService } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolveMetaDeleteCapability(input.entityType);

  // Dry-run never mutates and never prompts for confirmation.
  if (input.dry_run === true) {
    const dryRun = await runMetaDeleteDryRun(
      { entityType: input.entityType, entityId: input.entityId },
      metaService,
      context
    );
    return {
      confirmed: true,
      success: dryRun.wouldSucceed,
      entityId: input.entityId,
      entityType: input.entityType,
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
      entityId: input.entityId,
      entityType: input.entityType,
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  // Capture pre-delete raw state once; reused to build both `before` and the
  // symbolic `after` (a re-read after a hard delete 404s).
  const beforeRaw = await readMetaEntityRaw(metaService, input.entityType, input.entityId, context);
  const before: NormalizedEntitySnapshot | undefined = beforeRaw
    ? (buildMetaSnapshot(input.entityType, input.entityId, beforeRaw, {}) ?? undefined)
    : undefined;

  const result = await metaService.deleteEntity(input.entityId, context);
  const success = (result as Record<string, unknown>)?.success === true;

  const after: NormalizedEntitySnapshot | undefined =
    success && beforeRaw
      ? (buildMetaSnapshot(input.entityType, input.entityId, beforeRaw, { status: "DELETED" }) ??
        undefined)
      : undefined;

  return {
    confirmed: true,
    success,
    entityId: input.entityId,
    entityType: input.entityType,
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
        text: `Dry-run: deleting ${result.entityType} ${result.entityId} ${outcome}.\n\nTimestamp: ${result.timestamp}`,
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
  const status = result.success ? "deleted successfully" : "deletion returned unexpected response";
  return [
    {
      type: "text" as const,
      text: `${result.entityType} ${result.entityId} ${status}\n\nTimestamp: ${result.timestamp}`,
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
    idempotentHint: false,
    destructiveHint: true,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "meta_ads",
      contractPlatformSlug: "meta",
      contractToolSlug: "delete_entity",
      operation: ["delete"],
      // Governed scope is the canonical entity kinds (campaign / ad_set / ad).
      // adCreative and other non-canonical types are deletable but out of scope.
      entityKinds: ["campaign", "ad_set", "ad"],
      entityIdArgs: ["entityId"],
      readPartner: {
        toolName: "meta_get_entity",
        argMap: { entityId: "entityId" },
      },
      schemaVersion: 1,
      contractId: "meta.delete_entity.v1",
      // `dry_run` = symbolic validate + symbolic apply (expected post-state is
      // the entity with canonical status `deleted`). before/after captured via
      // the read partner around the real delete.
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Delete an ad creative",
      input: {
        entityType: "adCreative",
        entityId: "23456789012345",
      },
    },
  ],
  logic: deleteEntityLogic,
  responseFormatter: deleteEntityResponseFormatter,
};
