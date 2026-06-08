// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type MetaEntityType } from "../utils/entity-mapping.js";
import { runMetaCreateDryRun, resolveMetaCreateCapability } from "../utils/dry-run.js";
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
  NormalizedEntitySnapshot,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "meta_create_entity";
const TOOL_TITLE = "Create Meta Ads Entity";
const TOOL_DESCRIPTION = `Create a new Meta Ads entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

All entities are created under an ad account via POST /act_{id}/{edge}.

**Key requirements by entity type:**
- **campaign**: requires \`name\`, \`objective\` (e.g., OUTCOME_AWARENESS), \`special_ad_categories\` (array, can be empty [])
- **adSet**: requires \`name\`, \`campaign_id\`, \`optimization_goal\`, \`billing_event\`, \`targeting\`, \`status\`
- **ad**: requires \`name\`, \`adset_id\`, \`creative\` (object with creative_id)
- **adCreative**: requires \`name\` and creative content fields (object_story_spec, etc.)
- **customAudience**: requires \`name\`, \`subtype\`

**Gotchas:**
- Budget values are in cents (1000 = $10 USD)
- Campaigns need \`special_ad_categories\` even if empty ([])
- Writes are rate-limited at 3x read cost`;

export const CreateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to create"),
    adAccountId: z.string().describe("Ad Account ID (with or without act_ prefix)"),
    data: z.record(z.any()).describe("Entity fields as key-value pairs"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the proposed creation and returns a DryRunResult under `dryRun` (expected post-state = the would-be-created entity, normalized) without calling the Meta Graph API. No entity is created."
      ),
  })
  .describe("Parameters for creating a Meta Ads entity");

export const CreateEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Created entity (returns id at minimum)"),
    entityType: z.string(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No entity was created."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-create canonical snapshot, re-read by the new entity ID (in-scope kinds: campaign, ad_set, ad). Undefined for out-of-scope kinds or when the post-read fails. Create has no `before`."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to. Present on every response — dry-run and real create alike."
    ),
  })
  .describe("Entity creation result");

type CreateEntityInput = z.infer<typeof CreateEntityInputSchema>;
type CreateEntityOutput = z.infer<typeof CreateEntityOutputSchema>;

export async function createEntityLogic(
  input: CreateEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateEntityOutput> {
  const { metaService } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolveMetaCreateCapability(input.entityType);

  if (input.dry_run === true) {
    const dryRun = await runMetaCreateDryRun(
      { entityType: input.entityType, data: input.data },
      metaService,
      context
    );
    return {
      entity: {},
      entityType: input.entityType,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const entity = (await metaService.createEntity(
    input.entityType as MetaEntityType,
    input.adAccountId,
    input.data,
    context
  )) as unknown as Record<string, unknown>;

  // Re-read the created entity by its new ID for the canonical `after` snapshot
  // (Meta's create returns the id; a full read normalizes the snapshot). Create
  // has no `before`. Best-effort: undefined for out-of-scope kinds / read fail.
  const createdId = typeof entity?.id === "string" ? entity.id : undefined;
  const after: NormalizedEntitySnapshot | undefined = createdId
    ? await captureMetaSnapshot(metaService, input.entityType, createdId, context)
    : undefined;

  return {
    entity,
    entityType: input.entityType,
    timestamp: new Date().toISOString(),
    ...(after ? { after } : {}),
    dispatchedCapability,
  };
}

export function createEntityResponseFormatter(result: CreateEntityOutput): McpTextContent[] {
  if (result.dryRun) {
    const outcome = result.dryRun.wouldSucceed ? "would succeed" : "would FAIL";
    const errs = result.dryRun.validationErrors.map((e) => e.message).join("; ");
    return [
      {
        type: "text" as const,
        text:
          `Dry-run: creating ${result.entityType} ${outcome}.` +
          (errs ? `\nValidation: ${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `${result.entityType} created successfully\n${JSON.stringify(result.entity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const createEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CreateEntityInputSchema,
  outputSchema: CreateEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: true,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "meta_ads",
      contractPlatformSlug: "meta",
      contractToolSlug: "create_entity",
      operation: ["create"],
      // Governed scope is the canonical kinds. adCreative / customAudience are
      // creatable but resolve canonicalEntityKind:null — still token-gated.
      entityKinds: ["campaign", "ad_set", "ad"],
      entityIdArgs: ["adAccountId"],
      readPartner: {
        toolName: "meta_get_entity",
        argMap: { entityType: "entityType", adAccountId: "adAccountId" },
      },
      schemaVersion: 1,
      contractId: "meta.create_entity.v1",
      // `dry_run` = symbolic validate + symbolic apply (expected post-state =
      // the would-be-created entity). `after` is re-read by the new ID on
      // execute (create has no `before`).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Create a traffic campaign",
      input: {
        entityType: "campaign",
        adAccountId: "act_123456789",
        data: {
          name: "Summer Sale 2026",
          objective: "OUTCOME_TRAFFIC",
          status: "PAUSED",
          special_ad_categories: [],
        },
      },
    },
    {
      label: "Create an ad set",
      input: {
        entityType: "adSet",
        adAccountId: "act_123456789",
        data: {
          name: "US 25-44 Interest Targeting",
          campaign_id: "23456789012345",
          optimization_goal: "LINK_CLICKS",
          billing_event: "IMPRESSIONS",
          daily_budget: 5000,
          targeting: {
            age_min: 25,
            age_max: 44,
            geo_locations: { countries: ["US"] },
          },
          status: "PAUSED",
        },
      },
    },
  ],
  logic: createEntityLogic,
  responseFormatter: createEntityResponseFormatter,
};
