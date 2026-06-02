// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type CM360EntityType } from "../utils/entity-mapping.js";
import { runCm360UpdateDryRun, resolveCm360DispatchedCapability } from "../utils/dry-run.js";
import { captureCm360Snapshot, snapshotFromCm360Entity } from "../utils/capture-snapshot.js";
import {
  DryRunResultSchema,
  NormalizedEntitySnapshotSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext, CesteralWriteToolAnnotations } from "@cesteral/shared";

const TOOL_NAME = "cm360_update_entity";
const TOOL_TITLE = "Update CM360 Entity";
const TOOL_DESCRIPTION = `Update a Campaign Manager 360 entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

CM360 uses PUT semantics — provide the full entity object including the id field. Use cm360_get_entity first to fetch the current state, modify the fields you need, then pass the full object.`;

export const UpdateEntityInputSchema = z
  .object({
    profileId: z.string().min(1).describe("CM360 User Profile ID"),
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to update"),
    entityId: z.string().min(1).describe("The entity ID to update"),
    data: z
      .record(z.any())
      .describe("Full entity data including id field (CM360 uses PUT/replace semantics)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the proposed mutation and returns a DryRunResult under `dryRun` without invoking the CM360 API. The underlying entity is never modified."
      ),
  })
  .describe("Parameters for updating a CM360 entity");

export const UpdateEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Updated entity data"),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. The mutation was NOT applied."
    ),
    before: NormalizedEntitySnapshotSchema.optional().describe(
      "Pre-write canonical snapshot of the entity, captured at the start of the handler. Populated when the entity type is in canonical scope (campaign, ad) and the read partner returns the entity. Undefined for out-of-scope types or when the pre-read fails."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-write canonical snapshot of the entity, normalized from the entity the CM360 PUT returns (re-read fallback). Undefined when the entity type is out of canonical scope or both reads fail."
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
  const { cm360Service } = resolveSessionServices(sdkContext);

  // The (operation, entityKind) this call resolves to — derived from the
  // `data` payload. Required on every governed response.
  const dispatchedCapability = resolveCm360DispatchedCapability(input.entityType, input.data);

  if (input.dry_run === true) {
    const dryRun = await runCm360UpdateDryRun(
      {
        entityType: input.entityType,
        profileId: input.profileId,
        entityId: input.entityId,
        data: input.data,
      },
      cm360Service,
      context
    );
    return {
      entity: {},
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  // R4-U2: capture pre-state before mutating. Best-effort — out-of-scope
  // entity types and read failures leave `before` undefined.
  const before = await captureCm360Snapshot(
    cm360Service,
    input.entityType,
    input.profileId,
    input.entityId,
    context
  );

  const data = { ...input.data, id: input.entityId };

  const entity = await cm360Service.updateEntity(
    input.entityType as CM360EntityType,
    input.profileId,
    data,
    context
  );

  // R4-U2: the CM360 PUT returns the updated entity — normalize it directly,
  // falling back to a re-read if the response shape is unexpected.
  let after = snapshotFromCm360Entity(
    input.entityType,
    input.entityId,
    (entity as unknown as Record<string, unknown>) ?? {}
  );
  if (!after) {
    after = await captureCm360Snapshot(
      cm360Service,
      input.entityType,
      input.profileId,
      input.entityId,
      context
    );
  }

  return {
    entity: entity as unknown as Record<string, any>,
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
      text: `Entity updated successfully\n${JSON.stringify(result.entity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: true,
    destructiveHint: true,
    idempotentHint: true,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "cm360",
      contractPlatformSlug: "cm360",
      contractToolSlug: "update_entity",
      // `cm360_update_entity` is a multi-operation dispatcher: callers change
      // status, name, schedule, etc. via the `data` payload, so the contract
      // advertises every canonical op it can express.
      operation: ["update_budget", "pause", "resume", "update_status", "update"],
      // Governed scope is campaign + ad — the CM360 entities carrying a
      // canonical status. placement is intentionally out of scope (a
      // governance taxonomy decision is pending); advertiser / creative have
      // no canonical entity kind and are also out of scope.
      entityKinds: ["campaign", "ad"],
      entityIdArgs: ["entityId"],
      readPartner: {
        toolName: "cm360_get_entity",
        argMap: { profileId: "profileId", entityType: "entityType", entityId: "entityId" },
      },
      schemaVersion: 1,
      contractId: "cm360.update_entity.v1",
      // R4-U2: `dry_run` is symbolic apply — CM360 exposes no native validate
      // / preview / draft mode. Validation runs symbolic business rules;
      // expected post-state is the read-partner snapshot shallow-merged with
      // the patch. `before` / `after` are captured pre-write and from the
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
      label: "Update a campaign name",
      input: {
        profileId: "123456",
        entityType: "campaign",
        entityId: "789012",
        data: {
          id: "789012",
          name: "Q1 2026 Brand Campaign - Updated",
          advertiserId: "456789",
          startDate: "2026-01-15",
          endDate: "2026-03-31",
        },
      },
    },
    {
      label: "Pause an ad (dry run)",
      input: {
        profileId: "123456",
        entityType: "ad",
        entityId: "345678",
        data: {
          id: "345678",
          active: false,
        },
        dry_run: true,
      },
    },
  ],
  logic: updateEntityLogic,
  responseFormatter: updateEntityResponseFormatter,
};
