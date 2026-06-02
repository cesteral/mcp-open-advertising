// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { runDv360DuplicateDryRun, resolveDv360DuplicateCapability } from "../utils/dry-run.js";
import { snapshotFromDv360Entity } from "../utils/capture-snapshot.js";
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

const TOOL_NAME = "dv360_duplicate_entity";
const TOOL_TITLE = "Duplicate DV360 Entity";

/**
 * Entity types that support duplication via copy-on-read.
 * Only insertionOrder and lineItem are commonly duplicated in DV360 workflows.
 */
const DUPLICATABLE_ENTITY_TYPES = ["insertionOrder", "lineItem"] as const;
type DuplicatableEntityType = (typeof DUPLICATABLE_ENTITY_TYPES)[number];

const TOOL_DESCRIPTION = `Duplicate a DV360 insertion order or line item by creating a copy.

**Supported entity types:** ${DUPLICATABLE_ENTITY_TYPES.join(", ")}

The tool fetches the source entity, strips read-only fields, and creates a new entity
with the same configuration. The copy is created in DRAFT status by default.

**Options:**
- \`displayName\`: Custom name for the copy (defaults to "Copy of {original name}")

Returns the new entity from the DV360 API. Use dv360_get_entity to verify.`;

const commonDuplicateFields = {
  advertiserId: z.string().describe("DV360 Advertiser ID that owns the entity"),
  displayName: z
    .string()
    .optional()
    .describe("Optional display name for the copy (defaults to 'Copy of {original}')"),
  dry_run: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "When true, validates the duplication and returns a DryRunResult under `dryRun` (expected post-state = the would-be-created copy in a non-running state — DRAFT for line items, PAUSED for insertion orders — projected from the source) without calling the DV360 API. No copy is created."
    ),
};

// Discriminated by entityType so the source ID is carried in the platform's own
// field name (`insertionOrderId` / `lineItemId`). This matches `dv360_get_entity`'s
// required arg shape, so the governed `readPartner` mapping is satisfiable.
export const DuplicateEntityInputSchema = z
  .discriminatedUnion("entityType", [
    z.object({
      entityType: z.literal("insertionOrder"),
      insertionOrderId: z.string().min(1).describe("ID of the insertion order to duplicate"),
      ...commonDuplicateFields,
    }),
    z.object({
      entityType: z.literal("lineItem"),
      lineItemId: z.string().min(1).describe("ID of the line item to duplicate"),
      ...commonDuplicateFields,
    }),
  ])
  .describe("Parameters for duplicating a DV360 entity");

export const DuplicateEntityOutputSchema = z
  .object({
    duplicatedEntity: z.record(z.any()).describe("The newly created entity"),
    sourceEntityId: z.string().describe("ID of the source entity"),
    entityType: z.string().describe("Type of entity duplicated"),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No copy was created."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-duplicate canonical snapshot of the created copy (in-scope kinds: insertion_order, line_item). Duplicate has no `before`."
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
  const { dv360Service } = resolveSessionServices(sdkContext);

  const entityType = input.entityType as DuplicatableEntityType;
  const entityIdField = `${entityType}Id`;
  const entityId =
    input.entityType === "insertionOrder" ? input.insertionOrderId : input.lineItemId;

  const ids: Record<string, string> = {
    advertiserId: input.advertiserId,
    [entityIdField]: entityId,
  };

  const dispatchedCapability = resolveDv360DuplicateCapability(entityType);

  if (input.dry_run === true) {
    const dryRun = await runDv360DuplicateDryRun({ entityType, ids }, dv360Service, context);
    return {
      duplicatedEntity: {},
      sourceEntityId: entityId,
      entityType,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const newEntity = (await dv360Service.duplicateEntity(
    entityType,
    ids,
    input.displayName,
    context
  )) as Record<string, unknown>;

  // The duplicate returns the created copy. Fold its new ID into the ids so the
  // `after` snapshot's `platformEntityId` reflects the copy, not the source.
  // Duplicate has no `before`. Best-effort: undefined for out-of-scope kinds.
  const newId = newEntity?.[entityIdField];
  const idsForAfter =
    typeof newId === "string" || typeof newId === "number"
      ? { advertiserId: input.advertiserId, [entityIdField]: String(newId) }
      : ids;
  const after: NormalizedEntitySnapshot | undefined = snapshotFromDv360Entity(
    entityType,
    idsForAfter,
    newEntity ?? {}
  );

  return {
    duplicatedEntity: newEntity,
    sourceEntityId: entityId,
    entityType,
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
  const entity = result.duplicatedEntity;
  const newId = entity[`${result.entityType}Id`] ?? entity.name ?? "unknown";

  return [
    {
      type: "text" as const,
      text: [
        `DV360 ${result.entityType} duplicated successfully`,
        "",
        `Source Entity ID: ${result.sourceEntityId}`,
        `New Entity ID: ${newId}`,
        `Display Name: ${entity.displayName ?? "N/A"}`,
        `Timestamp: ${result.timestamp}`,
        "",
        JSON.stringify(entity, null, 2),
      ].join("\n"),
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
      platform: "dv360",
      contractPlatformSlug: "dv360",
      contractToolSlug: "duplicate_entity",
      operation: ["duplicate"],
      // Only insertionOrder / lineItem are duplicatable; both are governed
      // kinds with a canonical snapshot.
      entityKinds: ["insertion_order", "line_item"],
      // The source ID is carried in the platform's own field name so the read
      // partner (dv360_get_entity, which requires insertionOrderId/lineItemId)
      // can be satisfied from the manifest.
      entityIdArgs: ["advertiserId", "insertionOrderId", "lineItemId"],
      readPartner: {
        toolName: "dv360_get_entity",
        argMap: {
          advertiserId: "advertiserId",
          insertionOrderId: "insertionOrderId",
          lineItemId: "lineItemId",
        },
      },
      schemaVersion: 1,
      contractId: "dv360.duplicate_entity.v1",
      // `dry_run` = symbolic: read the source and project it as the non-running
      // copy (DRAFT for line items, PAUSED for insertion orders; empty new ID).
      // `after` re-reads the created copy by its new ID. No `before`.
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Duplicate a line item",
      input: {
        entityType: "lineItem",
        advertiserId: "1234567890",
        lineItemId: "9876543210",
        displayName: "Q2 Display LI - Copy",
      },
    },
    {
      label: "Duplicate an insertion order",
      input: {
        entityType: "insertionOrder",
        advertiserId: "1234567890",
        insertionOrderId: "5555555555",
      },
    },
  ],
  logic: duplicateEntityLogic,
  responseFormatter: duplicateEntityResponseFormatter,
};
