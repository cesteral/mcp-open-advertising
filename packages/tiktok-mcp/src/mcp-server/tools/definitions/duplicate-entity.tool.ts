// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
import { getDuplicateEntityTypeEnum, type TikTokEntityType } from "../utils/entity-mapping.js";
import { runTiktokDuplicateDryRun, resolveTiktokDuplicateCapability } from "../utils/dry-run.js";
import { snapshotFromTiktokEntity } from "../utils/capture-snapshot.js";
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

const TOOL_NAME = "tiktok_duplicate_entity";
const TOOL_TITLE = "Duplicate TikTok Ads Entity";
const TOOL_DESCRIPTION = `Duplicate a TikTok Ads entity (copy it).

**Supported entity types:** ${getDuplicateEntityTypeEnum().join(", ")}

Creates a copy of the entity. The copy is created in DISABLED status by default.
Use the returned entity ID to make modifications before enabling.`;

export const DuplicateEntityInputSchema = z
  .object({
    entityType: z.enum(getDuplicateEntityTypeEnum()).describe("Type of entity to duplicate"),
    advertiserId: z.string().min(1).describe("TikTok Advertiser ID"),
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
        "When true, validates the duplication and returns a DryRunResult under `dryRun` (expected post-state = the would-be-created copy in a disabled state, projected from the source) without calling the TikTok API. No copy is created."
      ),
  })
  .describe("Parameters for duplicating a TikTok Ads entity");

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
      "Post-duplicate canonical snapshot of the created copy (in-scope kinds: campaign, ad_group, ad). Duplicate has no `before`."
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
  const { tiktokService, boundAdvertiserId } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolveTiktokDuplicateCapability(input.entityType);

  if (input.dry_run === true) {
    const dryRun = await runTiktokDuplicateDryRun(
      { entityType: input.entityType, entityId: input.entityId, options: input.options },
      tiktokService,
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

  // Fail fast on a mismatched account — but only on the real-execution path, so a
  // dry-run preview with a different id is allowed (matches the other write tools).
  assertAccountScope(input.advertiserId, boundAdvertiserId, "advertiserId");

  const newEntity = (await tiktokService.duplicateEntity(
    input.entityType as TikTokEntityType,
    input.entityId,
    input.options,
    context
  )) as unknown as Record<string, unknown>;

  // The duplicate returns the full new entity, so normalize it directly for the
  // canonical `after` snapshot (no re-read needed). Duplicate has no `before`.
  // Best-effort: undefined for out-of-scope kinds.
  const newId = String(
    newEntity?.campaign_id ?? newEntity?.adgroup_id ?? newEntity?.ad_id ?? newEntity?.id ?? ""
  );
  const after: NormalizedEntitySnapshot | undefined = snapshotFromTiktokEntity(
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
      platform: "tiktok",
      contractPlatformSlug: "tiktok",
      contractToolSlug: "duplicate_entity",
      operation: ["duplicate"],
      entityKinds: ["campaign", "ad_group", "ad"],
      entityIdArgs: ["entityId"],
      readPartner: {
        toolName: "tiktok_get_entity",
        argMap: { entityType: "entityType", advertiserId: "advertiserId", entityId: "entityId" },
      },
      schemaVersion: 1,
      contractId: "tiktok.duplicate_entity.v1",
      // `dry_run` = symbolic: read the source and project it as the disabled
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
        advertiserId: "1234567890",
        entityId: "1800123456789",
      },
    },
    {
      label: "Duplicate an ad group with new name",
      input: {
        entityType: "adGroup",
        advertiserId: "1234567890",
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
