// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  entityContextReadParams,
  getEntityConfig,
  getEntityTypeEnum,
  getWriteParent,
  pickEntityContext,
  refineEntityContext,
  type MsAdsEntityType,
} from "../utils/entity-mapping.js";
import {
  runMsAdsUpdateDryRun,
  resolveMsAdsDispatchedCapability,
  symbolicValidate,
} from "../utils/dry-run.js";
import {
  captureMsAdsSnapshot,
  resolveMsAdsCurrency,
  snapshotFromMsAdsEntity,
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

const TOOL_NAME = "msads_update_entity";
const TOOL_TITLE = "Update Microsoft Ads Entity";
const TOOL_DESCRIPTION = `Update an existing Microsoft Advertising entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Provide the entity ID plus the partial fields to change in \`data\` — Microsoft Ads
supports partial updates, so only include fields you want to modify (do NOT include
\`Id\`; it is injected). The tool wraps the patch in the entity's plural collection key.

Some entity types require their parent ID, which is sent as the request-body
parent element Microsoft Ads' Update operation takes next to the entity array and
is also used to read the entity back for before/after snapshots: campaign and
adExtension need \`accountId\` (AccountId), adGroup needs \`campaignId\`
(CampaignId), ad and keyword need \`adGroupId\` (AdGroupId).`;

// Flat object + superRefine, not a discriminated union: a top-level union is
// published to MCP clients as an empty input schema, and this tool's
// definitionHash was computed over that empty schema (#228). The per-type
// context requirements live in entity-mapping.ts (`getEntityContextKeys`).
export const UpdateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to update"),
    entityId: z.string().min(1).describe("The entity ID to update"),
    accountId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Account that owns the entity, sent as the request-body AccountId. Required for campaign and adExtension"
      ),
    campaignId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Campaign that owns the ad group, sent as the request-body CampaignId. Required for adGroup"
      ),
    adGroupId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Ad group that owns the ad or keyword, sent as the request-body AdGroupId. Required for ad and keyword"
      ),
    adExtensionType: z
      .string()
      .min(1)
      .optional()
      .describe("AdExtensionType, needed to read the ad extension. Required for adExtension"),
    data: z
      .record(z.unknown())
      .describe("Partial fields to update (do not include Id — it is injected)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the proposed mutation and returns a DryRunResult under `dryRun` without invoking the Microsoft Ads API. The underlying entity is never modified."
      ),
  })
  .superRefine(refineEntityContext)
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

/**
 * Build the request-body parent element the Update operation takes for this
 * entity type (`updatecampaigns.md` / `updateadextensions.md`: AccountId;
 * `updateadgroups.md`: CampaignId; `updateads.md` / `updatekeywords.md`:
 * AdGroupId). Budgets, audiences and labels take none.
 */
function buildWriteParentBody(input: UpdateEntityInput): Record<string, number> {
  const parent = getWriteParent(input.entityType as MsAdsEntityType);
  if (!parent) return {};
  const value = (input as Record<string, unknown>)[parent.inputKey];
  return typeof value === "string" ? { [parent.bodyField]: Number(value) } : {};
}

/** Build the parent/account context the read partner needs for this entity type. */
function buildReadParams(input: UpdateEntityInput): Record<string, unknown> {
  return entityContextReadParams(pickEntityContext(input.entityType as MsAdsEntityType, input));
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
  // the Id field injected, next to the request-body parent element.
  const config = getEntityConfig(input.entityType as MsAdsEntityType);
  const entityItem = { Id: Number(input.entityId), ...input.data };
  const payload = { ...buildWriteParentBody(input), [config.pluralName]: [entityItem] };

  // Fail fast on an empty or invalid update payload before hitting the API,
  // applying the same symbolic validation the dry-run path uses (finding M3) so
  // a payload the tool reports "would FAIL" under dry-run can't execute for real.
  if (Object.keys(input.data).length === 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      "`data` must contain at least one field to update a Microsoft Ads entity."
    );
  }
  const updateValidationErrors = symbolicValidate(entityItem);
  if (updateValidationErrors.length > 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Invalid update payload: ${updateValidationErrors.map((e) => e.message).join("; ")}`
    );
  }

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
    after = snapshotFromMsAdsEntity(
      input.entityType,
      input.entityId,
      entityItem,
      await resolveMsAdsCurrency(msadsService, context)
    );
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
        // The read needs the same parent context as the write (campaign:
        // accountId, adGroup: campaignId, ad/keyword: adGroupId, adExtension:
        // accountId + adExtensionType), so map it; a read built from the
        // manifest alone would otherwise fail for every parented type.
        argMap: {
          entityType: "entityType",
          entityId: "entityId",
          accountId: "accountId",
          campaignId: "campaignId",
          adGroupId: "adGroupId",
          adExtensionType: "adExtensionType",
        },
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
