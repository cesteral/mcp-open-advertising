// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getDuplicateEntityTypeEnum, type PinterestEntityType } from "../utils/entity-mapping.js";
import {
  runPinterestDuplicateDryRun,
  resolvePinterestDuplicateCapability,
} from "../utils/dry-run.js";
import { snapshotFromPinterestEntity } from "../utils/capture-snapshot.js";
import {
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

const TOOL_NAME = "pinterest_duplicate_entity";
const TOOL_TITLE = "Duplicate Pinterest Ads Entity";
const TOOL_DESCRIPTION = `Duplicate a Pinterest Ads entity (copy it).

**Supported entity types:** ${getDuplicateEntityTypeEnum().join(", ")}

Creates a copy of the entity. The copy is created in DISABLED status by default.
Use the returned entity ID to make modifications before enabling.`;

export const DuplicateEntityInputSchema = z
  .object({
    entityType: z.enum(getDuplicateEntityTypeEnum()).describe("Type of entity to duplicate"),
    adAccountId: z.string().min(1).describe("Pinterest Advertiser ID"),
    entityId: z.string().min(1).describe("ID of the entity to duplicate"),
    options: z
      .record(z.any())
      .optional()
      .describe("Optional copy options (e.g., new name, target campaign ID)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the duplication and returns a DryRunResult under `dryRun` (expected post-state = the would-be-created copy in a non-running state, projected from the source) without calling the Pinterest API. No copy is created."
      ),
  })
  .describe("Parameters for duplicating a Pinterest Ads entity");

export const DuplicateEntityOutputSchema = z
  .object({
    newEntity: z.record(z.any()).describe("Newly created duplicate entity data"),
    sourceEntityId: z.string(),
    entityType: z.string(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No copy was created."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-duplicate canonical snapshot of the created copy (in-scope kind: campaign — the only Pinterest kind that supports duplication). Duplicate has no `before`."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to. Present on every response."
    ),
  })
  .describe("Entity duplication result");

type DuplicateEntityInput = z.infer<typeof DuplicateEntityInputSchema>;
type DuplicateEntityOutput = z.infer<typeof DuplicateEntityOutputSchema>;

export async function duplicateEntityLogic(
  input: DuplicateEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DuplicateEntityOutput> {
  const { pinterestService } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolvePinterestDuplicateCapability(input.entityType);

  if (input.dry_run === true) {
    const dryRun = await runPinterestDuplicateDryRun(
      { entityType: input.entityType, adAccountId: input.adAccountId, entityId: input.entityId },
      pinterestService,
      context
    );
    return {
      newEntity: {},
      sourceEntityId: input.entityId,
      entityType: input.entityType,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const newEntity = (await pinterestService.duplicateEntity(
    input.entityType as PinterestEntityType,
    { adAccountId: input.adAccountId },
    input.entityId,
    input.options,
    context
  )) as Record<string, unknown>;

  // The duplicate returns the full new entity, so normalize it directly for the
  // canonical `after` snapshot (no re-read needed). Duplicate has no `before`.
  // Best-effort: undefined for out-of-scope kinds.
  const newId = String(newEntity?.id ?? "");
  const after: NormalizedEntitySnapshot | undefined = snapshotFromPinterestEntity(
    input.entityType,
    newId,
    newEntity
  );

  return {
    newEntity,
    sourceEntityId: input.entityId,
    entityType: input.entityType,
    timestamp: new Date().toISOString(),
    ...(after ? { after } : {}),
    dispatchedCapability,
  };
}

export function duplicateEntityResponseFormatter(result: DuplicateEntityOutput): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedStateSource } = result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    return [
      {
        type: "text" as const,
        text:
          `Dry run: duplicating ${result.entityType} ${verdict} (validation: ${validationSource}, expected-state: ${expectedStateSource}). No copy was created.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `${result.entityType} ${result.sourceEntityId} duplicated successfully\nNew entity:\n${JSON.stringify(result.newEntity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const duplicateEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: DuplicateEntityInputSchema,
  outputSchema: DuplicateEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: false,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "pinterest",
      contractPlatformSlug: "pinterest",
      contractToolSlug: "duplicate_entity",
      operation: ["duplicate"],
      // Only `campaign` supports duplication on Pinterest (PinterestService
      // rejects adGroup/ad); the tool's input enum already restricts to it.
      entityKinds: ["campaign"],
      entityIdArgs: ["entityId"],
      readPartner: {
        toolName: "pinterest_get_entity",
        argMap: { adAccountId: "adAccountId", entityId: "entityId" },
      },
      schemaVersion: 1,
      contractId: "pinterest.duplicate_entity.v1",
      // `dry_run` = symbolic: read the source and project it as the non-running
      // copy (empty new ID). `after` is normalized from the returned new entity.
      // No `before`.
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Duplicate a campaign",
      input: {
        entityType: "campaign",
        adAccountId: "1234567890",
        entityId: "1800123456789",
      },
    },
    {
      label: "Duplicate an ad group with new name",
      input: {
        entityType: "adGroup",
        adAccountId: "1234567890",
        entityId: "1700123456789",
        options: {
          adgroup_name: "Copy of Ad Group A",
        },
      },
    },
  ],
  logic: duplicateEntityLogic,
  responseFormatter: duplicateEntityResponseFormatter,
};
