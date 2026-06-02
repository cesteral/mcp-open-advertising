// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getDuplicateEntityTypeEnum } from "../utils/entity-mapping.js";
import { runMetaDuplicateDryRun, resolveMetaDuplicateCapability } from "../utils/dry-run.js";
import { captureMetaSnapshot } from "../utils/capture-snapshot.js";
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

const TOOL_NAME = "meta_duplicate_entity";
const TOOL_TITLE = "Duplicate Meta Ads Entity";
const TOOL_DESCRIPTION = `Duplicate a campaign, ad set, or ad via POST /{id}/copies.

**Supported entity types:** ${getDuplicateEntityTypeEnum().join(", ")}

Returns the new entity ID. Use meta_get_entity to fetch the full entity.

**Options:**
- \`rename_options\`: { prefix, suffix } for naming the copy
- \`status_option\`: ACTIVE, PAUSED, or INHERITED

**Note:** Effective 2026-05-19 Meta blocks \`/copies\` for Advantage+ Shopping and Advantage+ App campaigns (Marketing API v25.0). Use the standard Advantage+ campaign structure for those objectives instead.`;

export const DuplicateEntityInputSchema = z
  .object({
    entityType: z.enum(getDuplicateEntityTypeEnum()).describe("Type of entity to duplicate"),
    entityId: z.string().min(1).describe("ID of the entity to duplicate"),
    renameOptions: z
      .object({
        prefix: z.string().optional(),
        suffix: z.string().optional(),
      })
      .optional()
      .describe("Naming options for the copy"),
    statusOption: z
      .enum(["ACTIVE", "PAUSED", "INHERITED"])
      .optional()
      .describe("Status for the copy (default: PAUSED)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the duplication and returns a DryRunResult under `dryRun` (expected post-state = the would-be-created copy, projected from the source) without calling the Meta API. No copy is created."
      ),
  })
  .describe("Parameters for duplicating a Meta Ads entity");

export const DuplicateEntityOutputSchema = z
  .object({
    result: z.record(z.any()).describe("Duplication result (includes new entity ID)"),
    entityType: z.string(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No copy was created."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-duplicate canonical snapshot, re-read from the created copy by its new ID (in-scope kinds: campaign, ad_set, ad). Duplicate has no `before`."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to. Present on every response."
    ),
  })
  .describe("Entity duplication result");

type DuplicateEntityInput = z.infer<typeof DuplicateEntityInputSchema>;
type DuplicateEntityOutput = z.infer<typeof DuplicateEntityOutputSchema>;

/** Best-effort: pull the new copy's ID out of a Meta `/copies` response. */
function extractCopiedId(result: Record<string, unknown>): string | undefined {
  if (typeof result?.id === "string") return result.id;
  for (const [key, value] of Object.entries(result ?? {})) {
    if (/^copied_.*_id$/.test(key) && typeof value === "string") return value;
  }
  const adIds = (result as { ad_object_ids?: unknown[] })?.ad_object_ids;
  if (Array.isArray(adIds) && adIds.length > 0 && adIds[0] != null) return String(adIds[0]);
  return undefined;
}

export async function duplicateEntityLogic(
  input: DuplicateEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DuplicateEntityOutput> {
  const { metaService } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolveMetaDuplicateCapability(input.entityType);

  if (input.dry_run === true) {
    const dryRun = await runMetaDuplicateDryRun(
      {
        entityType: input.entityType,
        entityId: input.entityId,
        statusOption: input.statusOption,
        renameOptions: input.renameOptions,
      },
      metaService,
      context
    );
    return {
      result: {},
      entityType: input.entityType,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const options: Record<string, unknown> = {};

  if (input.renameOptions) {
    const renameOptions: Record<string, string> = {};
    if (input.renameOptions.prefix) {
      renameOptions.rename_prefix = input.renameOptions.prefix;
    }
    if (input.renameOptions.suffix) {
      renameOptions.rename_suffix = input.renameOptions.suffix;
    }
    if (Object.keys(renameOptions).length > 0) {
      options.rename_options = renameOptions;
    }
  }

  if (input.statusOption) {
    options.status_option = input.statusOption;
  }

  const result = (await metaService.duplicateEntity(
    input.entityId,
    Object.keys(options).length > 0 ? options : undefined,
    context
  )) as Record<string, unknown>;

  // Re-read the created copy by its new ID for the canonical `after` snapshot
  // (Meta's /copies returns only IDs). Duplicate has no `before`. Best-effort:
  // undefined for out-of-scope kinds, unextractable IDs, or read failure.
  const copiedId = extractCopiedId(result);
  const after: NormalizedEntitySnapshot | undefined = copiedId
    ? await captureMetaSnapshot(metaService, input.entityType, copiedId, context)
    : undefined;

  return {
    result,
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
      text: `Entity duplicated successfully\n${JSON.stringify(result.result, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: true,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "meta_ads",
      contractPlatformSlug: "meta",
      contractToolSlug: "duplicate_entity",
      operation: ["duplicate"],
      entityKinds: ["campaign", "ad_set", "ad"],
      entityIdArgs: ["entityId"],
      readPartner: {
        toolName: "meta_get_entity",
        argMap: { entityId: "entityId" },
      },
      schemaVersion: 1,
      contractId: "meta.duplicate_entity.v1",
      // `dry_run` = symbolic validate + symbolic apply: read the source and
      // project it as the copy (landing status + empty new ID). `after` is
      // re-read from the created copy by its new ID. Duplicate has no `before`.
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Duplicate a campaign with prefix",
      input: {
        entityType: "campaign",
        entityId: "23456789012345",
        renameOptions: { prefix: "Copy of " },
        statusOption: "PAUSED",
      },
    },
  ],
  logic: duplicateEntityLogic,
  responseFormatter: duplicateEntityResponseFormatter,
};
