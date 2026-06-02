// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type AmazonDspEntityType } from "../utils/entity-mapping.js";
import {
  runAmazonDspDuplicateDryRun,
  resolveAmazonDspDuplicateCapability,
} from "../utils/dry-run.js";
import { snapshotFromAmazonDspEntity } from "../utils/capture-snapshot.js";
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

const TOOL_NAME = "amazon_dsp_duplicate_entity";
const TOOL_TITLE = "Duplicate AmazonDsp Ads Entity";
const TOOL_DESCRIPTION = `Duplicate a AmazonDsp Ads entity (copy it).

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Creates a copy of the entity. The copy is created in DISABLED status by default.
Use the returned entity ID to make modifications before enabling.`;

export const DuplicateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to duplicate"),
    profileId: z.string().min(1).describe("AmazonDsp Advertiser ID"),
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
        "When true, validates the duplication and returns a DryRunResult under `dryRun` (expected post-state = the would-be-created copy in a non-running state, projected from the source) without calling the Amazon DSP API. No copy is created."
      ),
  })
  .describe("Parameters for duplicating a AmazonDsp Ads entity");

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
      "Post-duplicate canonical snapshot of the created copy (in-scope kinds: order, line_item). Duplicate has no `before`."
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
  const { amazonDspService } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolveAmazonDspDuplicateCapability(input.entityType);

  if (input.dry_run === true) {
    const dryRun = await runAmazonDspDuplicateDryRun(
      { entityType: input.entityType, entityId: input.entityId },
      amazonDspService,
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

  const newEntity = (await amazonDspService.duplicateEntity(
    input.entityType as AmazonDspEntityType,
    input.entityId,
    input.options,
    context
  )) as unknown as Record<string, unknown>;

  // The duplicate returns the full new entity, so normalize it directly for the
  // canonical `after` snapshot (no re-read needed). Duplicate has no `before`.
  // Best-effort: undefined for out-of-scope kinds.
  const newId = String(newEntity?.orderId ?? newEntity?.lineItemId ?? newEntity?.id ?? "");
  const after: NormalizedEntitySnapshot | undefined = snapshotFromAmazonDspEntity(
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
      platform: "amazon_dsp",
      contractPlatformSlug: "amazon_dsp",
      contractToolSlug: "duplicate_entity",
      operation: ["duplicate"],
      // Governed scope is order / line_item. creative / target /
      // creativeAssociation duplicate but resolve canonicalEntityKind:null —
      // still token-gated.
      entityKinds: ["order", "line_item"],
      entityIdArgs: ["entityId"],
      readPartner: {
        toolName: "amazon_dsp_get_entity",
        argMap: { profileId: "profileId", entityId: "entityId" },
      },
      schemaVersion: 1,
      contractId: "amazon_dsp.duplicate_entity.v1",
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
      label: "Duplicate an order (campaign)",
      input: {
        entityType: "order",
        profileId: "1234567890",
        entityId: "ord_123456789",
      },
    },
    {
      label: "Duplicate a line item with new name",
      input: {
        entityType: "lineItem",
        profileId: "1234567890",
        entityId: "li_123456789",
        options: {
          name: "Copy of Line Item A",
        },
      },
    },
  ],
  logic: duplicateEntityLogic,
  responseFormatter: duplicateEntityResponseFormatter,
};
