// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type PinterestEntityType } from "../utils/entity-mapping.js";
import {
  runPinterestUpdateDryRun,
  resolvePinterestDispatchedCapability,
  symbolicValidate,
} from "../utils/dry-run.js";
import {
  capturePinterestSnapshot,
  snapshotFromPinterestEntity,
} from "../utils/capture-snapshot.js";
import {
  McpError,
  JsonRpcErrorCode,
  DryRunResultSchema,
  NormalizedEntitySnapshotSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext, CesteralWriteToolAnnotations } from "@cesteral/shared";

const TOOL_NAME = "pinterest_update_entity";
const TOOL_TITLE = "Update Pinterest Ads Entity";
const TOOL_DESCRIPTION = `Update a Pinterest Ads entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Pinterest uses PATCH for updates with entity ID in the body. Only provided fields are modified.

**Gotchas:**
- Use \`pinterest_bulk_update_status\` for status-only changes (more efficient)
- ad_account_id is automatically injected`;

export const UpdateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to update"),
    adAccountId: z.string().min(1).describe("Pinterest Advertiser ID"),
    entityId: z.string().min(1).describe("The entity ID to update"),
    data: z.record(z.any()).describe("Fields to update as key-value pairs"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the proposed mutation and returns a DryRunResult under `dryRun` without invoking the Pinterest API. The underlying entity is never modified."
      ),
  })
  .describe("Parameters for updating a Pinterest Ads entity");

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
      "Pre-write canonical snapshot of the entity, captured at the start of the handler. Populated when the entity type is in canonical scope (campaign, adGroup, ad) and the read partner returns the entity. Undefined for out-of-scope types or when the pre-read fails."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-write canonical snapshot of the entity, normalized from the entity the Pinterest PATCH returns (re-read fallback). Undefined when the entity type is out of canonical scope or both reads fail."
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
  const { pinterestService } = resolveSessionServices(sdkContext);

  // The (operation, entityKind) this call resolves to — derived from the
  // `data` payload. Required on every governed response.
  const dispatchedCapability = resolvePinterestDispatchedCapability(input.entityType, input.data);

  if (input.dry_run === true) {
    const dryRun = await runPinterestUpdateDryRun(
      {
        entityType: input.entityType,
        adAccountId: input.adAccountId,
        entityId: input.entityId,
        data: input.data,
      },
      pinterestService,
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

  // Fail fast on an empty or invalid update payload before hitting the API,
  // applying the same symbolic validation the dry-run path uses (finding M3) so
  // a payload the tool reports "would FAIL" under dry-run can't execute for real.
  if (Object.keys(input.data).length === 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      "`data` must contain at least one field to update a Pinterest entity."
    );
  }
  const updateValidationErrors = symbolicValidate(input.data);
  if (updateValidationErrors.length > 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Invalid update payload: ${updateValidationErrors.map((e) => e.message).join("; ")}`
    );
  }

  // R4-U4: capture pre-state before mutating. Best-effort — out-of-scope
  // entity types and read failures leave `before` undefined.
  const before = await capturePinterestSnapshot(
    pinterestService,
    input.entityType,
    input.adAccountId,
    input.entityId,
    context
  );

  const updated = await pinterestService.updateEntity(
    input.entityType as PinterestEntityType,
    { adAccountId: input.adAccountId },
    input.entityId,
    input.data,
    context
  );

  // R4-U4: the Pinterest PATCH returns the updated entity — normalize it
  // directly, falling back to a re-read if the response shape is unexpected.
  let after = snapshotFromPinterestEntity(
    input.entityType,
    input.entityId,
    (updated as unknown as Record<string, unknown>) ?? {}
  );
  if (!after) {
    after = await capturePinterestSnapshot(
      pinterestService,
      input.entityType,
      input.adAccountId,
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
      platform: "pinterest",
      contractPlatformSlug: "pinterest",
      contractToolSlug: "update_entity",
      // `pinterest_update_entity` is a multi-operation dispatcher: callers
      // change status, budget, name, schedule, etc. via the `data` payload,
      // so the contract advertises every canonical op it can express.
      operation: ["update_budget", "pause", "resume", "update_status", "update"],
      // Governed scope is campaign, ad_group (adGroup) and ad — the entities
      // carrying a canonical status/budget snapshot. creative (Pin) has no
      // canonical entity kind and is intentionally out of scope.
      entityKinds: ["campaign", "ad_group", "ad"],
      entityIdArgs: ["entityId"],
      readPartner: {
        toolName: "pinterest_get_entity",
        argMap: { entityType: "entityType", adAccountId: "adAccountId", entityId: "entityId" },
      },
      schemaVersion: 1,
      contractId: "pinterest.update_entity.v1",
      // R4-U4: `dry_run` is symbolic apply — Pinterest exposes no native
      // validate / preview / draft mode. Validation runs symbolic business
      // rules; expected post-state is the read-partner snapshot shallow-merged
      // with the patch. `before` / `after` are captured pre-write and from the
      // entity the PATCH returns.
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      // Contract promises the governance admission layer requires.
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Update campaign name and budget",
      input: {
        entityType: "campaign",
        adAccountId: "1234567890",
        entityId: "1800123456789",
        data: {
          name: "Updated Campaign Name",
          daily_spend_cap: 20000000,
        },
      },
    },
    {
      label: "Update ad group budget",
      input: {
        entityType: "adGroup",
        adAccountId: "1234567890",
        entityId: "1700123456789",
        data: {
          budget_in_micro_currency: 10000000,
        },
      },
    },
  ],
  logic: updateEntityLogic,
  responseFormatter: updateEntityResponseFormatter,
};
