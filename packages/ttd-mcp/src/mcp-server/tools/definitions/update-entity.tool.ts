// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type TtdEntityType } from "../utils/entity-mapping.js";
import { addParentValidationIssue, mergeParentIdsIntoData } from "../utils/parent-id-validation.js";
import { runTtdUpdateDryRun, resolveTtdDispatchedCapability } from "../utils/dry-run.js";
import { captureTtdSnapshot, snapshotFromTtdEntity } from "../utils/capture-snapshot.js";
import {
  DryRunResultSchema,
  NormalizedEntitySnapshotSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext, CesteralWriteToolAnnotations } from "@cesteral/shared";

const TOOL_NAME = "ttd_update_entity";
const TOOL_TITLE = "Update TTD Entity";
const TOOL_DESCRIPTION = `Update an existing The Trade Desk entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Uses TTD API v3 PUT endpoint. Provide the entity ID and a data object with the fields to update.`;

export const UpdateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to update"),
    entityId: z.string().min(1).describe("The entity ID to update"),
    partnerId: z
      .string()
      .optional()
      .describe(
        "Partner ID (optional for advertiser updates; injected as PartnerId in the request body)"
      ),
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID (required for most non-advertiser entities)"),
    campaignId: z.string().optional().describe("Campaign ID (required for adGroup)"),
    adGroupId: z.string().optional().describe("Ad Group ID (required for ad)"),
    data: z.record(z.any()).describe("Entity data fields to update"),
    strictMode: z
      .boolean()
      .optional()
      .describe(
        "Set TTD-Strict-Mode header — TTD returns 400 on unrecognized properties or read-only field assignments. Recommended for development/CI; avoid in production (per TTD Foundations §10)."
      ),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the proposed mutation and returns a DryRunResult under `dryRun` without invoking the TTD API. The underlying entity is never modified."
      ),
  })
  .superRefine((input, ctx) => {
    addParentValidationIssue(
      ctx,
      input.entityType as TtdEntityType,
      input as Record<string, unknown>,
      input.data
    );
  })
  .describe("Parameters for updating a TTD entity");

export const UpdateEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Updated entity data").optional(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. The mutation was NOT applied."
    ),
    before: NormalizedEntitySnapshotSchema.optional().describe(
      "Pre-write canonical snapshot of the entity, captured at the start of the handler. Populated when the entity type is in canonical scope (campaign, adGroup) and the read partner returns the entity. Undefined for out-of-scope types or when the pre-read fails."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-write canonical snapshot of the entity, normalized from the entity the TTD PUT returns (re-read fallback). Undefined when the entity type is out of canonical scope or both reads fail."
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
  const { ttdService } = resolveSessionServices(sdkContext);

  // The (operation, entityKind) this call resolves to — derived from the
  // `data` payload. Required on every governed response.
  const dispatchedCapability = resolveTtdDispatchedCapability(input.entityType, input.data);

  if (input.dry_run === true) {
    const dryRun = await runTtdUpdateDryRun(
      { entityType: input.entityType, entityId: input.entityId, data: input.data },
      ttdService,
      context
    );
    return {
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  // R3-U2: capture pre-state before mutating. Best-effort — out-of-scope
  // entity types and read failures leave `before` undefined.
  const before = await captureTtdSnapshot(ttdService, input.entityType, input.entityId, context);

  const data = mergeParentIdsIntoData(input.data, input as Record<string, unknown>);

  const entity = await ttdService.updateEntity(
    input.entityType as TtdEntityType,
    input.entityId,
    data,
    context,
    { strictMode: input.strictMode }
  );

  // R3-U2: the TTD PUT returns the full updated entity — normalize it
  // directly, falling back to a re-read if the response shape is unexpected.
  let after = snapshotFromTtdEntity(
    input.entityType,
    input.entityId,
    (entity as unknown as Record<string, unknown>) ?? {}
  );
  if (!after) {
    after = await captureTtdSnapshot(ttdService, input.entityType, input.entityId, context);
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
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: false,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "ttd",
      contractPlatformSlug: "ttd",
      contractToolSlug: "update_entity",
      // `ttd_update_entity` is a multi-operation dispatcher: callers change
      // status, budget, name, etc. via the `data` payload, so the contract
      // advertises every canonical op it can express.
      operation: ["update_budget", "pause", "resume", "update_status", "update"],
      // Governed scope is campaign + ad_group — the entities carrying a
      // canonical Availability status. advertiser / creative /
      // conversionTracker have no canonical entity kind and are out of scope.
      entityKinds: ["campaign", "ad_group"],
      entityIdArgs: ["entityId"],
      readPartner: {
        toolName: "ttd_get_entity",
        argMap: { entityId: "entityId" },
      },
      schemaVersion: 1,
      contractId: "ttd.update_entity.v1",
      // R3-U2: `dry_run` is symbolic apply — TTD exposes no native validate /
      // preview / draft mode. Validation runs symbolic business rules;
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
      label: "Update campaign name",
      input: {
        entityType: "campaign",
        entityId: "camp456def",
        advertiserId: "adv123abc",
        data: {
          CampaignName: "Q1 2025 Brand Awareness - Updated",
        },
      },
    },
    {
      label: "Update ad group bid",
      input: {
        entityType: "adGroup",
        entityId: "ag789ghi",
        advertiserId: "adv123abc",
        campaignId: "camp456def",
        data: {
          RTBAttributes: {
            BaseBidCPM: { Amount: 4.25, CurrencyCode: "USD" },
          },
        },
      },
    },
  ],
  logic: updateEntityLogic,
  responseFormatter: updateEntityResponseFormatter,
};
