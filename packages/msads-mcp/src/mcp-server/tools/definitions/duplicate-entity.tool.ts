// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getDuplicateEntityTypeEnum, type MsAdsEntityType } from "../utils/entity-mapping.js";
import { runMsAdsDuplicateDryRun, resolveMsAdsDuplicateCapability } from "../utils/dry-run.js";
import { snapshotFromMsAdsEntity } from "../utils/capture-snapshot.js";
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

const TOOL_NAME = "msads_duplicate_entity";
const TOOL_TITLE = "Duplicate Microsoft Ads Entity";
const TOOL_DESCRIPTION = `Duplicate a Microsoft Advertising entity (copy it).

**Supported entity types:** ${getDuplicateEntityTypeEnum().join(", ")}

Creates a copy of the entity (clone via read + create — MS Ads has no native copy operation).
The copy preserves the source's settings unless overridden via \`options\`.
Use \`options\` (e.g. \`{ "Name": "Copy of …" }\`) to rename or re-state the copy.`;

/** Pull the first created ID out of an Add response (`*Ids: [...]`). */
function extractCreatedId(result: unknown): string {
  const record = (result ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (key.endsWith("Ids") && Array.isArray(value)) {
      const first = value.find((v) => v != null);
      if (first != null) return String(first);
    }
  }
  return "";
}

export const DuplicateEntityInputSchema = z
  .object({
    entityType: z.enum(getDuplicateEntityTypeEnum()).describe("Type of entity to duplicate"),
    accountId: z.string().min(1).describe("Microsoft Ads Account ID that owns the entity"),
    entityId: z.string().min(1).describe("ID of the entity to duplicate"),
    options: z.record(z.any()).optional().describe("Optional copy overrides (e.g., a new Name)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the duplication and returns a DryRunResult under `dryRun` (expected post-state = the would-be-created copy — the source with any `options` applied) without calling the Microsoft Ads API. No copy is created."
      ),
  })
  .describe("Parameters for duplicating a Microsoft Ads entity");

export const DuplicateEntityOutputSchema = z
  .object({
    result: z.record(z.any()).describe("Add-operation response with the new entity ID(s)"),
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
  const { msadsService } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolveMsAdsDuplicateCapability(input.entityType);

  if (input.dry_run === true) {
    const dryRun = await runMsAdsDuplicateDryRun(
      {
        entityType: input.entityType,
        accountId: input.accountId,
        entityId: input.entityId,
        options: input.options,
      },
      msadsService,
      context
    );
    return {
      result: {},
      sourceEntityId: input.entityId,
      entityType: input.entityType,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const { result, item } = await msadsService.duplicateEntity(
    input.entityType as MsAdsEntityType,
    input.accountId,
    input.entityId,
    input.options,
    context
  );

  // MS Ads Add returns only IDs, so the `after` snapshot is normalized from the
  // submitted copy with the new ID. Duplicate has no `before`.
  const createdId = extractCreatedId(result);
  const after: NormalizedEntitySnapshot | undefined = snapshotFromMsAdsEntity(
    input.entityType,
    createdId,
    item
  );

  return {
    result: result as Record<string, unknown>,
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
      text: `${result.entityType} ${result.sourceEntityId} duplicated successfully\nResult:\n${JSON.stringify(result.result, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
      platform: "msads",
      contractPlatformSlug: "msads",
      contractToolSlug: "duplicate_entity",
      operation: ["duplicate"],
      // Only `campaign` supports duplication on MS Ads (account-scoped,
      // self-contained Add payload); the input enum already restricts to it.
      entityKinds: ["campaign"],
      entityIdArgs: ["accountId", "entityId"],
      readPartner: {
        toolName: "msads_get_entity",
        argMap: { entityType: "entityType", accountId: "accountId", entityId: "entityId" },
      },
      schemaVersion: 1,
      contractId: "msads.duplicate_entity.v1",
      // `dry_run` = symbolic: read the source and project it as the copy (empty
      // new ID). `after` is normalized from the submitted copy. No `before`.
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
        accountId: "123456789",
        entityId: "987654321",
      },
    },
    {
      label: "Duplicate a campaign with a new name",
      input: {
        entityType: "campaign",
        accountId: "123456789",
        entityId: "987654321",
        options: { Name: "Copy of Summer Campaign" },
      },
    },
  ],
  logic: duplicateEntityLogic,
  responseFormatter: duplicateEntityResponseFormatter,
};
