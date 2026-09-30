// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
import {
  getDuplicableEntityTypeEnum,
  getEntityContract,
  type AmazonDspEntityType,
} from "../utils/entity-mapping.js";
import { AccountIdSchema } from "../utils/account-id.js";
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
const TOOL_DESCRIPTION = `Duplicate an Amazon DSP entity (copy it). The Unified API has no copy operation, so this reads the source (\`POST /adsApi/v1/query/{resource}\`) and creates a copy (\`POST /adsApi/v1/create/{resource}\`).

**Supported entity types:** ${getDuplicableEntityTypeEnum().join(", ")}

The copy carries the source's create-schema fields (read-only fields such as IDs, timestamps, \`status\` and currency codes are dropped; campaign flights lose their \`flightId\`) and is created PAUSED. Children are not copied. \`options\` override fields on the copy; orders and line items can only be created PAUSED, so a different \`options.state\` is refused.`;

export const DuplicateEntityInputSchema = z
  .object({
    entityType: z.enum(getDuplicableEntityTypeEnum()).describe("Type of entity to duplicate"),
    profileId: z.string().min(1).describe("Amazon Ads profile ID bound to this session"),
    accountId: AccountIdSchema,
    entityId: z.string().min(1).describe("ID of the entity to duplicate"),
    options: z
      .record(z.any())
      .optional()
      .describe(
        "Optional field overrides for the copy (Unified field names, e.g. { name } or a line item's { campaignId })"
      ),
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
  const { amazonDspService, boundProfileId } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolveAmazonDspDuplicateCapability(input.entityType);

  if (input.dry_run === true) {
    const dryRun = await runAmazonDspDuplicateDryRun(
      {
        entityType: input.entityType,
        accountId: input.accountId,
        entityId: input.entityId,
        options: input.options,
      },
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

  // Fail fast on a mismatched account — but only on the real-execution path, so a
  // dry-run preview with a different id is allowed (matches the other write tools).
  assertAccountScope(input.profileId, boundProfileId, "profileId");

  const newEntity = await amazonDspService.duplicateEntity(
    input.entityType as AmazonDspEntityType,
    input.accountId,
    input.entityId,
    input.options,
    context
  );

  // The create returns the full new entity (207 `success[0].<item>`), so
  // normalize it directly for the canonical `after` snapshot (no re-read
  // needed). Duplicate has no `before`. Best-effort: undefined for
  // out-of-scope kinds.
  const idField = getEntityContract(input.entityType as AmazonDspEntityType).idField;
  const newId = String(newEntity?.[idField] ?? "");
  const after: NormalizedEntitySnapshot | undefined = snapshotFromAmazonDspEntity(
    input.entityType,
    newId,
    newEntity,
    input.accountId
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
      // Governed scope is order / line_item. creative / creativeAssociation
      // duplicate but resolve canonicalEntityKind:null — still token-gated.
      // target cannot be duplicated (no read by ID).
      entityKinds: ["order", "line_item"],
      entityIdArgs: ["entityId"],
      readPartner: {
        toolName: "amazon_dsp_get_entity",
        argMap: {
          entityType: "entityType",
          profileId: "profileId",
          accountId: "accountId",
          entityId: "entityId",
        },
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
        accountId: "5550001112223",
        entityId: "581234567890123",
      },
    },
    {
      label: "Duplicate a line item (ad group) with a new name",
      input: {
        entityType: "lineItem",
        profileId: "1234567890",
        accountId: "5550001112223",
        entityId: "592345678901234",
        options: {
          name: "Copy of Ad Group A",
        },
      },
    },
  ],
  logic: duplicateEntityLogic,
  responseFormatter: duplicateEntityResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.newEntity", "$.dryRun", "$.after"],
    contentBlocks: [0],
  },
};
