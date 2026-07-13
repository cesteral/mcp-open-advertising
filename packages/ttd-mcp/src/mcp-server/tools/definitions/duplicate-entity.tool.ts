// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getDuplicateEntityTypeEnum, type TtdEntityType } from "../utils/entity-mapping.js";
import { runTtdDuplicateDryRun, resolveTtdDuplicateCapability } from "../utils/dry-run.js";
import { snapshotFromTtdEntity } from "../utils/capture-snapshot.js";
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

const TOOL_NAME = "ttd_duplicate_entity";
const TOOL_TITLE = "Duplicate TTD Entity";
const TOOL_DESCRIPTION = `Duplicate a The Trade Desk entity (copy it).

**Supported entity types:** ${getDuplicateEntityTypeEnum().join(", ")}

Creates a copy of the entity (clone via read + create — TTD has no native copy API).
The copy preserves the source's settings unless overridden via \`options\`.
Use \`options\` (e.g. \`{ "CampaignName": "Copy of …" }\`) to rename or re-state the copy.`;

export const DuplicateEntityInputSchema = z
  .object({
    entityType: z.enum(getDuplicateEntityTypeEnum()).describe("Type of entity to duplicate"),
    entityId: z.string().min(1).describe("ID of the entity to duplicate"),
    options: z
      .record(z.any())
      .optional()
      .describe("Optional copy overrides (e.g., a new CampaignName)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the duplication and returns a DryRunResult under `dryRun` (expected post-state = the would-be-created copy — the source with any `options` applied) without calling the TTD API. No copy is created."
      ),
  })
  .describe("Parameters for duplicating a TTD entity");

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
      "Post-duplicate canonical snapshot of the created copy (in-scope kind: campaign). Duplicate has no `before`."
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
  const { ttdService } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolveTtdDuplicateCapability(input.entityType);

  if (input.dry_run === true) {
    const dryRun = await runTtdDuplicateDryRun(
      { entityType: input.entityType, entityId: input.entityId, options: input.options },
      ttdService,
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

  const newEntity = (await ttdService.duplicateEntity(
    input.entityType as TtdEntityType,
    input.entityId,
    input.options,
    context
  )) as unknown as Record<string, any>;

  // The duplicate returns the full new entity, so normalize it directly for the
  // canonical `after` snapshot (no re-read needed). Duplicate has no `before`.
  const newId = String(newEntity?.CampaignId ?? newEntity?.Id ?? "");
  const after: NormalizedEntitySnapshot | undefined = snapshotFromTtdEntity(
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
      platform: "ttd",
      contractPlatformSlug: "ttd",
      contractToolSlug: "duplicate_entity",
      operation: ["duplicate"],
      // Only `campaign` supports duplication on TTD (its create body is
      // self-contained); the input enum already restricts to it.
      entityKinds: ["campaign"],
      entityIdArgs: ["entityId"],
      readPartner: {
        toolName: "ttd_get_entity",
        argMap: { entityType: "entityType", entityId: "entityId" },
      },
      schemaVersion: 1,
      contractId: "ttd.duplicate_entity.v1",
      // `dry_run` = symbolic: read the source and project it as the copy (empty
      // new ID). `after` is normalized from the returned new entity. No `before`.
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
        entityId: "cmp-9876543",
      },
    },
    {
      label: "Duplicate a campaign with a new name",
      input: {
        entityType: "campaign",
        entityId: "cmp-9876543",
        options: { CampaignName: "Copy of Summer Campaign" },
      },
    },
  ],
  logic: duplicateEntityLogic,
  responseFormatter: duplicateEntityResponseFormatter,
};
