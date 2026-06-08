// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getArchiveSupportedEntityTypes, type TtdEntityType } from "../utils/entity-mapping.js";
import {
  elicitArchiveConfirmation,
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

const TOOL_NAME = "ttd_archive_entities";
const TOOL_TITLE = "Archive TTD Entities";
const ARCHIVE_TYPES = getArchiveSupportedEntityTypes();
const ARCHIVE_TYPE_ENUM = ARCHIVE_TYPES as [string, ...string[]];

const TOOL_DESCRIPTION = `Archive (soft-delete) multiple The Trade Desk entities by setting their Availability to "Archived".

**Supported entity types:** ${ARCHIVE_TYPES.join(", ")}

⚠️ **Warning:** Archiving is irreversible — archived entities cannot be un-archived. Use "Paused" status for temporary deactivation instead.`;

export const ArchiveEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(ARCHIVE_TYPE_ENUM)
      .describe("Type of entities to archive (only campaign and adGroup support archiving)"),
    entityIds: z
      .array(z.string().min(1))
      .min(1)
      .max(100)
      .describe("Array of entity IDs to archive (max 100)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the archive request and returns an EffectDryRunResult under `dryRun` (expected effect = N entities archived) without calling the TTD API or prompting for confirmation. Nothing is archived."
      ),
  })
  .describe("Parameters for archiving TTD entities");

export const ArchiveEntitiesOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    entityType: z.string(),
    totalRequested: z.number(),
    successCount: z.number(),
    failureCount: z.number(),
    results: z.array(
      z.object({
        entityId: z.string(),
        success: z.boolean(),
        error: z.string().optional(),
      })
    ),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. Nothing was archived."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `entities_archived` + scalar batch audit summary). Present on a confirmed execute."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `archive` with `canonicalEntityKind: null` (effect class; a batch archive carries no per-entity canonical snapshot). Present on every response."
    ),
  })
  .describe("Archive entities result");

type ArchiveInput = z.infer<typeof ArchiveEntitiesInputSchema>;
type ArchiveOutput = z.infer<typeof ArchiveEntitiesOutputSchema>;

export async function archiveEntitiesLogic(
  input: ArchiveInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ArchiveOutput> {
  // Effect-class write: a batch archive carries no per-entity canonical
  // snapshot (archiving is irreversible — there is no reversible after-state).
  const dispatchedCapability: DispatchedCapability = {
    operation: "archive",
    canonicalEntityKind: null,
  };

  if (input.dry_run === true) {
    return {
      confirmed: true,
      entityType: input.entityType,
      totalRequested: input.entityIds.length,
      successCount: 0,
      failureCount: 0,
      results: [],
      timestamp: new Date().toISOString(),
      dryRun: buildArchiveEffectDryRun(input),
      dispatchedCapability,
    };
  }

  const confirmed = await elicitArchiveConfirmation({
    count: input.entityIds.length,
    entityLabel: input.entityType,
    sdkContext,
  });
  if (!confirmed) {
    return {
      confirmed: false,
      declineReason: "user_declined",
      entityType: input.entityType,
      totalRequested: input.entityIds.length,
      successCount: 0,
      failureCount: 0,
      results: [],
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  const { ttdService } = resolveSessionServices(sdkContext);

  const { results } = await ttdService.archiveEntities(
    input.entityType as TtdEntityType,
    input.entityIds,
    context
  );

  const succeeded = results.filter((r) => r.success).length;

  const effect: EffectResult = {
    effectKind: "entities_archived",
    summary: {
      entity_type: input.entityType,
      requested: input.entityIds.length,
      succeeded,
      failed: input.entityIds.length - succeeded,
    },
  };

  return {
    confirmed: true,
    entityType: input.entityType,
    totalRequested: input.entityIds.length,
    successCount: succeeded,
    failureCount: input.entityIds.length - succeeded,
    results,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `archive_entities`. The supported entity types
 * and the 1..100 id-count bounds are enforced by the input schema, so a
 * well-formed call always passes; the projected effect is the archival of the
 * supplied ids. Pure (no I/O) — no entities are touched.
 */
function buildArchiveEffectDryRun(input: ArchiveInput): EffectDryRunResult {
  const expectedEffect: EffectResult = {
    effectKind: "entities_archived",
    summary: { entity_type: input.entityType, requested: input.entityIds.length },
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

export function archiveEntitiesResponseFormatter(result: ArchiveOutput): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationSource, expectedEffectSource } = result.dryRun;
    return [
      {
        type: "text" as const,
        text: `Dry run: archiving ${result.totalRequested} ${result.entityType}(s) ${wouldSucceed ? "would succeed" : "would FAIL"} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). Nothing was archived.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Archive of ${result.totalRequested} ${result.entityType}(s) cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Archive ${result.entityType}: ${result.successCount}/${result.totalRequested} succeeded, ${result.failureCount} failed\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const archiveEntitiesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ArchiveEntitiesInputSchema,
  outputSchema: ArchiveEntitiesOutputSchema,
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
      contractToolSlug: "archive_entities",
      operation: ["archive"],
      entityKinds: [],
      entityIdArgs: ["entityIds"],
      schemaVersion: 1,
      contractId: "ttd.archive_entities.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Archive multiple ad groups",
      input: {
        entityType: "adGroup",
        entityIds: ["adg111aaa", "adg222bbb", "adg333ccc"],
      },
    },
    {
      label: "Archive a finished campaign",
      input: {
        entityType: "campaign",
        entityIds: ["camp456def"],
      },
    },
  ],
  logic: archiveEntitiesLogic,
  responseFormatter: archiveEntitiesResponseFormatter,
};
