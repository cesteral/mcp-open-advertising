// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getDuplicateEntityTypeEnum, type SnapchatEntityType } from "../utils/entity-mapping.js";
import {
  runSnapchatDuplicateDryRun,
  resolveSnapchatDuplicateCapability,
} from "../utils/dry-run.js";
import { snapshotFromSnapchatEntity } from "../utils/capture-snapshot.js";
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

const TOOL_NAME = "snapchat_duplicate_entity";
const TOOL_TITLE = "Duplicate Snapchat Ads Entity";
const TOOL_DESCRIPTION = `Duplicate a Snapchat Ads entity (copy it).

**Supported entity types:** ${getDuplicateEntityTypeEnum().join(", ")}

Creates a copy of the entity (clone via read + create — Snapchat has no native copy API).
The copy preserves the source's settings, including its status, unless overridden via \`options\`.
Use \`options\` (e.g. \`{ "name": "Copy of …" }\`) to rename or re-state the copy.`;

export const DuplicateEntityInputSchema = z
  .object({
    entityType: z.enum(getDuplicateEntityTypeEnum()).describe("Type of entity to duplicate"),
    adAccountId: z.string().min(1).describe("Snapchat Advertiser ID"),
    entityId: z.string().min(1).describe("ID of the entity to duplicate"),
    options: z
      .record(z.any())
      .optional()
      .describe("Optional copy overrides (e.g., new name)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the duplication and returns a DryRunResult under `dryRun` (expected post-state = the would-be-created copy — the source with any `options` applied) without calling the Snapchat API. No copy is created."
      ),
  })
  .describe("Parameters for duplicating a Snapchat Ads entity");

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
  const { snapchatService } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolveSnapchatDuplicateCapability(input.entityType);

  if (input.dry_run === true) {
    const dryRun = await runSnapchatDuplicateDryRun(
      { entityType: input.entityType, entityId: input.entityId, options: input.options },
      snapchatService,
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

  const newEntity = (await snapchatService.duplicateEntity(
    input.entityType as SnapchatEntityType,
    { adAccountId: input.adAccountId },
    input.entityId,
    input.options,
    context
  )) as Record<string, unknown>;

  // The duplicate returns the full new entity, so normalize it directly for the
  // canonical `after` snapshot (no re-read needed). Duplicate has no `before`.
  const newId = String(newEntity?.id ?? "");
  const after: NormalizedEntitySnapshot | undefined = snapshotFromSnapchatEntity(
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
      platform: "snapchat",
      contractPlatformSlug: "snapchat",
      contractToolSlug: "duplicate_entity",
      operation: ["duplicate"],
      // Only `campaign` supports duplication on Snapchat (its create endpoint
      // needs no extra parent ID); the input enum already restricts to it.
      entityKinds: ["campaign"],
      entityIdArgs: ["entityId"],
      readPartner: {
        toolName: "snapchat_get_entity",
        argMap: { entityType: "entityType", adAccountId: "adAccountId", entityId: "entityId" },
      },
      schemaVersion: 1,
      contractId: "snapchat.duplicate_entity.v1",
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
        adAccountId: "8adc3db7-8148-4fbf-999c-8a2e1c5b8f0a",
        entityId: "92e1c5b8-8148-4fbf-999c-8adc3db78148",
      },
    },
    {
      label: "Duplicate a campaign with a new name",
      input: {
        entityType: "campaign",
        adAccountId: "8adc3db7-8148-4fbf-999c-8a2e1c5b8f0a",
        entityId: "92e1c5b8-8148-4fbf-999c-8adc3db78148",
        options: { name: "Copy of Summer Campaign" },
      },
    },
  ],
  logic: duplicateEntityLogic,
  responseFormatter: duplicateEntityResponseFormatter,
};
