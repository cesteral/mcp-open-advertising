// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type PinterestEntityType } from "../utils/entity-mapping.js";
import { runPinterestCreateDryRun, resolvePinterestCreateCapability } from "../utils/dry-run.js";
import { snapshotFromPinterestEntity } from "../utils/capture-snapshot.js";
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

const TOOL_NAME = "pinterest_create_entity";
const TOOL_TITLE = "Create Pinterest Ads Entity";
const TOOL_DESCRIPTION = `Create a new Pinterest Ads entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**Key requirements by entity type:**
- **campaign**: requires \`campaign_name\`, \`objective_type\` (e.g., TRAFFIC, APP_INSTALLS), \`budget_mode\` (BUDGET_MODE_DAY or BUDGET_MODE_TOTAL), \`budget\`
- **adGroup**: requires \`campaign_id\`, \`adgroup_name\`, \`placement_type\`, \`budget_mode\`, \`budget\`, \`schedule_type\`, \`optimize_goal\`
- **ad**: requires \`adgroup_id\`, \`ad_name\`, \`creative_type\`, creative fields (image_ids or video_id)
- **creative**: requires \`display_name\`, creative content (image_ids or video_id)

**Gotchas:**
- Budget values are in the advertiser's account currency
- All status values use prefix format (e.g., CAMPAIGN_STATUS_ENABLE)
- ad_account_id is automatically injected`;

export const CreateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to create"),
    adAccountId: z.string().min(1).describe("Pinterest Advertiser ID"),
    data: z.record(z.any()).describe("Entity fields as key-value pairs"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the creation and returns a DryRunResult under `dryRun` (expected post-state = the would-be-created entity) without calling the Pinterest API. No entity is created."
      ),
  })
  .describe("Parameters for creating a Pinterest Ads entity");

export const CreateEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Created entity data (includes entity ID)"),
    entityType: z.string(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No entity was created."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-create canonical snapshot, normalized from the created entity (in-scope kinds: campaign, ad_group, ad). Create has no `before`."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to. Present on every response."
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
  const { pinterestService } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolvePinterestCreateCapability(input.entityType);

  if (input.dry_run === true) {
    const dryRun = await runPinterestCreateDryRun(
      { entityType: input.entityType, data: input.data },
      pinterestService,
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

  const entity = (await pinterestService.createEntity(
    input.entityType as PinterestEntityType,
    { adAccountId: input.adAccountId },
    input.data,
    context
  )) as unknown as Record<string, unknown>;

  // Normalize the created entity for the canonical `after` snapshot. Create has
  // no `before`. Best-effort: undefined for out-of-scope kinds.
  const createdId = String(entity?.id ?? "");
  const after: NormalizedEntitySnapshot | undefined = snapshotFromPinterestEntity(
    input.entityType,
    createdId,
    entity
  );

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
      platform: "pinterest",
      contractPlatformSlug: "pinterest",
      contractToolSlug: "create_entity",
      operation: ["create"],
      entityKinds: ["campaign", "ad_group", "ad"],
      entityIdArgs: ["adAccountId"],
      readPartner: {
        toolName: "pinterest_get_entity",
        argMap: { entityType: "entityType", adAccountId: "adAccountId" },
      },
      schemaVersion: 1,
      contractId: "pinterest.create_entity.v1",
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
        adAccountId: "1234567890",
        data: {
          campaign_name: "Summer Sale 2026",
          objective_type: "TRAFFIC",
          budget_mode: "BUDGET_MODE_DAY",
          budget: 100,
        },
      },
    },
    {
      label: "Create an ad group",
      input: {
        entityType: "adGroup",
        adAccountId: "1234567890",
        data: {
          campaign_id: "1800123456789",
          adgroup_name: "US 25-44 Interest Targeting",
          placement_type: "PLACEMENT_TYPE_NORMAL",
          budget_mode: "BUDGET_MODE_DAY",
          budget: 50,
          schedule_type: "SCHEDULE_START_END",
          schedule_start_time: "2026-01-01 00:00:00",
          schedule_end_time: "2026-12-31 23:59:59",
          optimize_goal: "CLICK",
        },
      },
    },
  ],
  logic: createEntityLogic,
  responseFormatter: createEntityResponseFormatter,
};
