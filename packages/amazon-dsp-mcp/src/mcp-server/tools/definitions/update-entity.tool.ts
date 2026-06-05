// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type AmazonDspEntityType } from "../utils/entity-mapping.js";
import {
  runAmazonDspUpdateDryRun,
  resolveAmazonDspDispatchedCapability,
} from "../utils/dry-run.js";
import {
  captureAmazonDspSnapshot,
  snapshotFromAmazonDspEntity,
} from "../utils/capture-snapshot.js";
import {
  DryRunResultSchema,
  NormalizedEntitySnapshotSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext, CesteralWriteToolAnnotations } from "@cesteral/shared";

const TOOL_NAME = "amazon_dsp_update_entity";
const TOOL_TITLE = "Update AmazonDsp Ads Entity";
const TOOL_DESCRIPTION = `Update a AmazonDsp Ads entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

AmazonDsp uses PUT to the entity-specific resource. Only provided fields are modified.

**Gotchas:**
- Use \`amazon_dsp_bulk_update_status\` for status-only changes (more efficient)
- profile_id is automatically injected`;

export const UpdateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to update"),
    profileId: z.string().min(1).describe("AmazonDsp Advertiser ID"),
    entityId: z.string().min(1).describe("The entity ID to update"),
    data: z.record(z.any()).describe("Fields to update as key-value pairs"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the proposed mutation and returns a DryRunResult under `dryRun` without invoking the Amazon DSP API. The underlying entity is never modified."
      ),
  })
  .describe("Parameters for updating a AmazonDsp Ads entity");

export const UpdateEntityOutputSchema = z
  .object({
    entityId: z.string(),
    entityType: z.string(),
    updated: z.boolean(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. The mutation was NOT applied."
    ),
    before: NormalizedEntitySnapshotSchema.optional().describe(
      "Pre-write canonical snapshot of the entity, captured at the start of the handler. Populated when the entity type is in canonical scope (order, lineItem) and the read partner returns the entity. Undefined for out-of-scope types or when the pre-read fails."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-write canonical snapshot of the entity, normalized from the entity the Amazon DSP PUT returns (re-read fallback). Undefined when the entity type is out of canonical scope or both reads fail."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to, derived from the `data` payload. Present on every response — dry-run and real write alike."
    ),
  })
  .describe("Entity update result");

type UpdateEntityInput = z.infer<typeof UpdateEntityInputSchema>;
type UpdateEntityOutput = z.infer<typeof UpdateEntityOutputSchema>;

export async function updateEntityLogic(
  input: UpdateEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UpdateEntityOutput> {
  const { amazonDspService } = resolveSessionServices(sdkContext);

  // The (operation, entityKind) this call resolves to — derived from the
  // `data` payload. Required on every governed response.
  const dispatchedCapability = resolveAmazonDspDispatchedCapability(input.entityType, input.data);

  if (input.dry_run === true) {
    const dryRun = await runAmazonDspUpdateDryRun(
      { entityType: input.entityType, entityId: input.entityId, data: input.data },
      amazonDspService,
      context
    );
    return {
      entityId: input.entityId,
      entityType: input.entityType,
      updated: false,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  // R2-U4: capture pre-state before mutating. Best-effort — out-of-scope
  // entity types and read failures leave `before` undefined.
  const before = await captureAmazonDspSnapshot(
    amazonDspService,
    input.entityType,
    input.entityId,
    context
  );

  const updated = await amazonDspService.updateEntity(
    input.entityType as AmazonDspEntityType,
    input.entityId,
    input.data,
    context
  );

  // R2-U4: the Amazon DSP PUT returns the updated entity — normalize it
  // directly, falling back to a re-read if the response shape is unexpected.
  let after = snapshotFromAmazonDspEntity(
    input.entityType,
    input.entityId,
    (updated as unknown as Record<string, unknown>) ?? {}
  );
  if (!after) {
    after = await captureAmazonDspSnapshot(
      amazonDspService,
      input.entityType,
      input.entityId,
      context
    );
  }

  return {
    entityId: input.entityId,
    entityType: input.entityType,
    updated: true,
    timestamp: new Date().toISOString(),
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    dispatchedCapability,
  };
}

export function updateEntityResponseFormatter(result: UpdateEntityOutput): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedStateSource } = result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errorLines = validationErrors.length
      ? "\n" + validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n")
      : "";
    return [
      {
        type: "text" as const,
        text: `Dry run: mutation ${verdict} (validation: ${validationSource}, expected-state: ${expectedStateSource}). The entity was NOT modified.${errorLines}\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `${result.entityType} ${result.entityId} updated successfully\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const updateEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UpdateEntityInputSchema,
  outputSchema: UpdateEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "amazon_dsp",
      contractPlatformSlug: "amazon_dsp",
      contractToolSlug: "update_entity",
      // `amazon_dsp_update_entity` is a multi-operation dispatcher: callers
      // change status, budget, name, schedule, etc. via the `data` payload,
      // so the contract advertises every canonical op it can express.
      operation: ["update_budget", "pause", "resume", "update_status", "update"],
      // Governed scope is order (campaign-equivalent) and lineItem
      // (ad-group-equivalent) — the entities carrying a canonical
      // status/budget snapshot. creative / target / creativeAssociation have
      // no canonical entity kind and are intentionally out of scope.
      entityKinds: ["order", "line_item"],
      entityIdArgs: ["entityId"],
      readPartner: {
        toolName: "amazon_dsp_get_entity",
        argMap: { entityType: "entityType", profileId: "profileId", entityId: "entityId" },
      },
      schemaVersion: 1,
      contractId: "amazon_dsp.update_entity.v1",
      // R2-U4: `dry_run` is symbolic apply — Amazon DSP exposes no native
      // validate / preview / draft mode. Validation runs symbolic business
      // rules; expected post-state is the read-partner snapshot shallow-merged
      // with the patch. `before` / `after` are captured pre-write and from the
      // entity the PUT returns.
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      // Contract promises the governance admission layer requires.
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Update order (campaign) name and budget",
      input: {
        entityType: "order",
        profileId: "1234567890",
        entityId: "ord_123456789",
        data: {
          name: "Updated Order Name",
          budget: 20000,
        },
      },
    },
    {
      label: "Update line item bid",
      input: {
        entityType: "lineItem",
        profileId: "1234567890",
        entityId: "li_123456789",
        data: {
          bidding: { bidOptimization: "MANUAL", bidAmount: 2.0 },
        },
      },
    },
  ],
  logic: updateEntityLogic,
  responseFormatter: updateEntityResponseFormatter,
};
