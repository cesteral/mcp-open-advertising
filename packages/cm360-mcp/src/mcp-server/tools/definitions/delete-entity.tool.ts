// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getDeletableEntityTypeEnum, type CM360EntityType } from "../utils/entity-mapping.js";
import {
  elicitDeleteConfirmation,
  assertGovernedEffectDryRun,
  EffectResultSchema,
  EffectDryRunResultSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  RequestContext,
  McpTextContent,
  SdkContext,
  EffectResult,
  EffectDryRunResult,
  DispatchedCapability,
  DryRunValidationError,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "cm360_delete_entity";
const TOOL_TITLE = "Delete CM360 Entity";
const TOOL_DESCRIPTION = `Delete a Campaign Manager 360 entity.

**Supported entity types:** ${getDeletableEntityTypeEnum().join(", ")}

Only floodlightActivity supports deletion. Other entity types must be archived by updating their status.`;

const EFFECT_KIND = "entity_deleted";

export const DeleteEntityInputSchema = z
  .object({
    profileId: z.string().min(1).describe("CM360 User Profile ID"),
    entityType: z.enum(getDeletableEntityTypeEnum()).describe("Type of entity to delete"),
    entityId: z.string().min(1).describe("The entity ID to delete"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the deletion and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be deletion) without prompting for confirmation or calling the CM360 API. The entity is never deleted."
      ),
  })
  .describe("Parameters for deleting a CM360 entity");

export const DeleteEntityOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    deleted: z.boolean().describe("Whether the entity was deleted"),
    entityType: z.string(),
    entityId: z.string().describe("ID of the deleted entity"),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. The entity was NOT deleted."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `entity_deleted` + scalar audit summary). Present on a confirmed delete. CM360's only deletable type (floodlightActivity) is not a canonical ad entity, so this write carries no before/after snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `manage` with `canonicalEntityKind: null` (effect class; floodlightActivity is not a canonical entity kind). Present on every response."
    ),
  })
  .describe("Entity deletion result");

type DeleteEntityInput = z.infer<typeof DeleteEntityInputSchema>;
type DeleteEntityOutput = z.infer<typeof DeleteEntityOutputSchema>;

export async function deleteEntityLogic(
  input: DeleteEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DeleteEntityOutput> {
  // Effect-class write: CM360's only deletable type (floodlightActivity) is not
  // in the canonical ENTITY_KIND_MAP, so a delete can never produce a before/after
  // snapshot. The capability is `manage` with a null entity kind.
  const dispatchedCapability: DispatchedCapability = {
    operation: "manage",
    canonicalEntityKind: null,
  };

  if (input.dry_run === true) {
    const dryRun = buildEffectDryRun(input);
    return {
      confirmed: true,
      deleted: false,
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
      deleted: false,
      entityType: input.entityType,
      entityId: input.entityId,
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  const { cm360Service } = resolveSessionServices(sdkContext);

  await cm360Service.deleteEntity(
    input.entityType as CM360EntityType,
    input.profileId,
    input.entityId,
    context
  );

  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: { entity_kind: input.entityType, entity_id: input.entityId },
  };

  return {
    confirmed: true,
    deleted: true,
    entityType: input.entityType,
    entityId: input.entityId,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `delete_entity`. CM360 has no native validate-only
 * delete, so both axes are symbolic. Validates the entity id is non-empty (guards
 * whitespace-only ids Zod's `.min(1)` admits) and projects the scalar would-be
 * effect. Pure (no I/O).
 */
function buildEffectDryRun(input: DeleteEntityInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  if (input.entityId.trim().length === 0) {
    validationErrors.push({
      code: "INVALID_ENTITY_ID",
      message: "entityId must be a non-empty entity id",
      field: "entityId",
    });
  }

  const expectedEffect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: { entity_kind: input.entityType, entity_id: input.entityId },
  };

  return assertGovernedEffectDryRun(
    {
      wouldSucceed: validationErrors.length === 0,
      validationErrors,
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect,
    },
    TOOL_NAME,
    { requiresValidation: true, requiresSimulation: true }
  );
}

export function deleteEntityResponseFormatter(result: DeleteEntityOutput): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedEffectSource } =
      result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    return [
      {
        type: "text" as const,
        text:
          `Dry run: deleting ${result.entityType} ${result.entityId} ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). The entity was NOT deleted.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Deletion of ${result.entityId} cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Entity ${result.entityId} deleted successfully\n\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: true,
    destructiveHint: true,
    idempotentHint: true,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "cm360",
      contractPlatformSlug: "cm360",
      contractToolSlug: "delete_entity",
      // CM360's only deletable type (floodlightActivity) is not a canonical ad
      // entity, so this delete has no snapshot — governed as a generic `manage`
      // effect rather than an entity-class `delete`.
      operation: ["manage"],
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "cm360.delete_entity.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Delete a floodlight activity",
      input: {
        profileId: "123456",
        entityType: "floodlightActivity",
        entityId: "345678",
      },
    },
  ],
  logic: deleteEntityLogic,
  responseFormatter: deleteEntityResponseFormatter,
};
