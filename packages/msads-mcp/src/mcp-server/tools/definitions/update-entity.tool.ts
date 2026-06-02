// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  getEntityConfig,
  getEntityTypeEnum,
  type MsAdsEntityType,
} from "../utils/entity-mapping.js";
import { runMsAdsUpdateDryRun, resolveMsAdsDispatchedCapability } from "../utils/dry-run.js";
import { captureMsAdsSnapshot, snapshotFromMsAdsEntity } from "../utils/capture-snapshot.js";
import {
  DryRunResultSchema,
  NormalizedEntitySnapshotSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext, CesteralWriteToolAnnotations } from "@cesteral/shared";

const TOOL_NAME = "msads_update_entity";
const TOOL_TITLE = "Update Microsoft Ads Entity";
const TOOL_DESCRIPTION = `Update an existing Microsoft Advertising entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Provide the entity ID plus the partial fields to change in \`data\` — Microsoft Ads
supports partial updates, so only include fields you want to modify (do NOT include
\`Id\`; it is injected). The tool wraps the patch in the entity's plural collection key.

Some entity types require parent/account context so the read partner can capture
before/after snapshots: campaign needs \`accountId\`, adGroup needs \`campaignId\`,
ad needs \`adGroupId\`.`;

const dataField = z
  .record(z.unknown())
  .describe("Partial fields to update (do not include Id — it is injected)");

const dryRunField = z
  .boolean()
  .optional()
  .default(false)
  .describe(
    "When true, validates the proposed mutation and returns a DryRunResult under `dryRun` without invoking the Microsoft Ads API. The underlying entity is never modified."
  );

export const UpdateEntityInputSchema = z
  .discriminatedUnion("entityType", [
    z.object({
      entityType: z.literal("campaign"),
      entityId: z.string().min(1).describe("The campaign ID to update"),
      accountId: z.string().min(1).describe("AccountId required to read the campaign back"),
      data: dataField,
      dry_run: dryRunField,
    }),
    z.object({
      entityType: z.literal("adGroup"),
      entityId: z.string().min(1).describe("The ad group ID to update"),
      campaignId: z.string().min(1).describe("CampaignId required to read the ad group back"),
      data: dataField,
      dry_run: dryRunField,
    }),
    z.object({
      entityType: z.literal("ad"),
      entityId: z.string().min(1).describe("The ad ID to update"),
      adGroupId: z.string().min(1).describe("AdGroupId required to read the ad back"),
      data: dataField,
      dry_run: dryRunField,
    }),
    z.object({
      entityType: z.literal("keyword"),
      entityId: z.string().min(1).describe("The keyword ID to update"),
      adGroupId: z.string().min(1).describe("AdGroupId required to read the keyword back"),
      data: dataField,
      dry_run: dryRunField,
    }),
    z.object({
      entityType: z.literal("budget"),
      entityId: z.string().min(1).describe("The budget ID to update"),
      data: dataField,
      dry_run: dryRunField,
    }),
    z.object({
      entityType: z.literal("adExtension"),
      entityId: z.string().min(1).describe("The ad extension ID to update"),
      accountId: z.string().min(1).describe("AccountId required to read the ad extension back"),
      adExtensionType: z.string().min(1).describe("AdExtensionType required for the read"),
      data: dataField,
      dry_run: dryRunField,
    }),
    z.object({
      entityType: z.literal("audience"),
      entityId: z.string().min(1).describe("The audience ID to update"),
      data: dataField,
      dry_run: dryRunField,
    }),
    z.object({
      entityType: z.literal("label"),
      entityId: z.string().min(1).describe("The label ID to update"),
      data: dataField,
      dry_run: dryRunField,
    }),
  ])
  .describe("Parameters for updating a Microsoft Ads entity");

export const UpdateEntityOutputSchema = z
  .object({
    result: z.record(z.any()),
    entityId: z.string(),
    entityType: z.string(),
    updated: z.boolean(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. The mutation was NOT applied."
    ),
    before: NormalizedEntitySnapshotSchema.optional().describe(
      "Pre-write canonical snapshot of the entity, captured at the start of the handler. Populated for governed entity types (campaign, adGroup, ad, budget) when the read partner returns the entity. Undefined for out-of-scope types or when the pre-read fails."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-write canonical snapshot of the entity, derived from the submitted patch merged onto the pre-read (re-read fallback). Undefined when the entity type is out of canonical scope or both reads fail."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to, derived from the `data` payload. Present on every response — dry-run and real write alike."
    ),
  })
  .describe("Entity update result");

type UpdateEntityInput = z.infer<typeof UpdateEntityInputSchema>;
type UpdateEntityOutput = z.infer<typeof UpdateEntityOutputSchema>;

/** Build the parent/account context the read partner needs for this entity type. */
function buildReadParams(input: UpdateEntityInput): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if ("accountId" in input) params.AccountId = Number(input.accountId);
  if ("campaignId" in input) params.CampaignId = Number(input.campaignId);
  if ("adGroupId" in input) params.AdGroupId = Number(input.adGroupId);
  if ("adExtensionType" in input) params.AdExtensionType = input.adExtensionType;
  return params;
}

export async function updateEntityLogic(
  input: UpdateEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UpdateEntityOutput> {
  const { msadsService } = resolveSessionServices(sdkContext);

  // The (operation, entityKind) this call resolves to — derived from the
  // `data` payload. Required on every governed response.
  const dispatchedCapability = resolveMsAdsDispatchedCapability(input.entityType, input.data);
  const readParams = buildReadParams(input);

  if (input.dry_run === true) {
    const dryRun = await runMsAdsUpdateDryRun(
      {
        entityType: input.entityType,
        entityId: input.entityId,
        data: input.data,
        readParams,
      },
      msadsService,
      context
    );
    return {
      result: {},
      entityId: input.entityId,
      entityType: input.entityType,
      updated: false,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  // R4-U5: capture pre-state before mutating. Best-effort — out-of-scope
  // entity types and read failures leave `before` undefined.
  const before = await captureMsAdsSnapshot(
    msadsService,
    input.entityType,
    input.entityId,
    readParams,
    context
  );

  // Microsoft Ads updates wrap the entity in its plural collection key with
  // the Id field injected.
  const config = getEntityConfig(input.entityType as MsAdsEntityType);
  const entityItem = { Id: Number(input.entityId), ...input.data };
  const payload = { [config.pluralName]: [entityItem] };

  const result = (await msadsService.updateEntity(
    input.entityType as MsAdsEntityType,
    payload,
    context
  )) as Record<string, unknown>;

  // R4-U5: the MS Ads PUT returns only batch errors / partial-failure markers,
  // never the patched entity — re-read post-write to capture `after`. If the
  // re-read fails, fall back to normalizing the submitted patch alone.
  let after = await captureMsAdsSnapshot(
    msadsService,
    input.entityType,
    input.entityId,
    readParams,
    context
  );
  if (!after) {
    after = snapshotFromMsAdsEntity(input.entityType, input.entityId, entityItem);
  }

  return {
    result,
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
      text: `Updated ${result.entityType} ${result.entityId}\n\nResult:\n${JSON.stringify(result.result, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
      platform: "msads",
      contractPlatformSlug: "msads",
      contractToolSlug: "update_entity",
      // `msads_update_entity` is a multi-operation dispatcher: callers change
      // status, budget, name, etc. via the `data` payload, so the contract
      // advertises every canonical op it can express.
      operation: ["update_budget", "pause", "resume", "update_status", "update"],
      // Governed scope is campaign / adGroup / ad / budget — the entities
      // carrying a canonical status and/or budget snapshot. keyword /
      // adExtension / audience / label have no canonical entity kind and are
      // intentionally out of scope.
      entityKinds: ["campaign", "ad_group", "ad", "campaign_budget"],
      entityIdArgs: ["entityId"],
      readPartner: {
        toolName: "msads_get_entity",
        argMap: { entityType: "entityType", entityId: "entityId" },
      },
      schemaVersion: 1,
      contractId: "msads.update_entity.v1",
      // R4-U5: `dry_run` is symbolic apply — Microsoft Ads exposes no native
      // validate / preview / draft mode. Validation runs symbolic business
      // rules; expected post-state is the read-partner snapshot shallow-merged
      // with the patch. `before` / `after` are captured pre-write and from the
      // submitted patch.
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      // Contract promises the governance admission layer requires.
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Pause a campaign",
      input: {
        entityType: "campaign",
        entityId: "123456",
        accountId: "789012",
        data: { Status: "Paused" },
      },
    },
    {
      label: "Update a shared budget amount",
      input: {
        entityType: "budget",
        entityId: "555000",
        data: { Amount: 250 },
      },
    },
  ],
  logic: updateEntityLogic,
  responseFormatter: updateEntityResponseFormatter,
};
