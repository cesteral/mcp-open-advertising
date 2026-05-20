// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum } from "../utils/entity-mapping.js";
import { runMetaUpdateDryRun, resolveMetaDispatchedCapability } from "../utils/dry-run.js";
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
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "meta_update_entity";
const TOOL_TITLE = "Update Meta Ads Entity";
const TOOL_DESCRIPTION = `Update an existing Meta Ads entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Uses POST /{entityId} with PATCH semantics — only provided fields are updated.

**Gotchas:**
- Returns \`{ success: true }\` on success, NOT the full entity. Use meta_get_entity to fetch updated state.
- \`targeting\` replaces entirely (no merge with existing targeting).
- Budget values are in cents (1000 = $10 USD).
- Budget changes limited to ~4/hour per ad set.
- Writes are rate-limited at 3x read cost.`;

export const UpdateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .optional()
      .describe(
        "Type of entity to update (optional — for informational purposes only, not used in API call)"
      ),
    entityId: z.string().min(1).describe("The entity ID to update"),
    data: z.record(z.any()).describe("Fields to update as key-value pairs"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the proposed mutation and returns a DryRunResult under `dryRun` without invoking the Meta Graph API. The underlying entity is never mutated."
      ),
  })
  .describe("Parameters for updating a Meta Ads entity");

export const UpdateEntityOutputSchema = z
  .object({
    success: z.boolean(),
    entityId: z.string(),
    entityType: z.string().optional(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. The mutation was NOT applied."
    ),
    before: NormalizedEntitySnapshotSchema.optional().describe(
      "Pre-write canonical snapshot of the entity, captured at the start of the handler. Populated when the entity type is in canonical scope (campaign, ad_set, ad) and the read partner returns the entity. Undefined for out-of-scope types or when the pre-read fails."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-write canonical snapshot of the entity. Captured by re-reading after the write because Meta's update endpoint returns only `{ success: true }`. Undefined when the post-read fails or the entity type is out of canonical scope."
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
  const { metaService } = resolveSessionServices(sdkContext);

  // The (operation, entityKind) this call resolves to — derived from the
  // `data` payload. Required on every governed response.
  const dispatchedCapability = resolveMetaDispatchedCapability(input.entityType, input.data);

  if (input.dry_run === true) {
    const dryRun = await runMetaUpdateDryRun(
      { entityType: input.entityType, entityId: input.entityId, data: input.data },
      metaService,
      context
    );
    return {
      success: dryRun.wouldSucceed,
      entityId: input.entityId,
      entityType: input.entityType,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  // PR-D: capture pre-state before mutating. Best-effort — out-of-scope entity
  // types and read failures leave `before` undefined and consumers fall back
  // to the read-partner round-trip.
  const before = await captureMetaSnapshot(metaService, input.entityType, input.entityId, context);

  const result = await metaService.updateEntity(input.entityId, input.data, context);

  const success = (result as Record<string, unknown>)?.success === true;

  // PR-D: Meta's update endpoint returns only `{ success: true }`, so we
  // re-read to populate `after`. Same best-effort semantics as `before`.
  const after = success
    ? await captureMetaSnapshot(metaService, input.entityType, input.entityId, context)
    : undefined;

  return {
    success,
    entityId: input.entityId,
    entityType: input.entityType,
    timestamp: new Date().toISOString(),
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    dispatchedCapability,
  };
}

export function updateEntityResponseFormatter(result: UpdateEntityOutput): McpTextContent[] {
  const status = result.success ? "updated successfully" : "update returned unexpected response";
  const entityLabel = result.entityType ?? "Entity";
  return [
    {
      type: "text" as const,
      text: `${entityLabel} ${result.entityId} ${status}\n\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: true,
    cesteral: {
      kind: "write",
      platform: "meta_ads",
      contractPlatformSlug: "meta",
      contractToolSlug: "update_entity",
      // `meta_update_entity` is a multi-operation dispatcher: callers update
      // budget, status, schedule, targeting, etc. via the `data` payload, so
      // the contract advertises every canonical op it can express.
      operation: ["update_budget", "pause", "resume", "update_status", "update"],
      entityKinds: ["campaign", "ad_set", "ad"],
      entityIdArgs: ["entityId"],
      readPartner: {
        toolName: "meta_get_entity",
        argMap: { entityId: "entityId" },
      },
      schemaVersion: 1,
      contractId: "meta.update_entity.v1",
      // PR-C wires `dry_run` (symbolic validator + symbolic apply via the
      // read partner). PR-D captures `before`/`after` snapshots on real
      // writes via the read partner (Meta's update endpoint returns only
      // `{ success: true }`).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      // Contract promises the governance admission layer requires: every
      // governed call validates the mutation and produces an expected
      // post-state (never `validationSource`/`expectedStateSource` "none").
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Pause a campaign",
      input: {
        entityType: "campaign",
        entityId: "23456789012345",
        data: { status: "PAUSED" },
      },
    },
    {
      label: "Update ad set budget",
      input: {
        entityType: "adSet",
        entityId: "23456789012345",
        data: { daily_budget: 10000 },
      },
    },
    {
      label: "Update ad set targeting",
      input: {
        entityType: "adSet",
        entityId: "23456789012345",
        data: {
          targeting: {
            age_min: 25,
            age_max: 55,
            geo_locations: { countries: ["US", "CA"] },
          },
        },
      },
    },
  ],
  logic: updateEntityLogic,
  responseFormatter: updateEntityResponseFormatter,
};
