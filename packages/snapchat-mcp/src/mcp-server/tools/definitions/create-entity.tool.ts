// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type SnapchatEntityType } from "../utils/entity-mapping.js";
import {
  runSnapchatCreateDryRun,
  resolveSnapchatCreateCapability,
  symbolicValidate,
} from "../utils/dry-run.js";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import { snapshotFromSnapchatEntity } from "../utils/capture-snapshot.js";
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

const TOOL_NAME = "snapchat_create_entity";
const TOOL_TITLE = "Create Snapchat Ads Entity";
const TOOL_DESCRIPTION = `Create a new Snapchat Ads entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**Key requirements by entity type:**
- **campaign**: requires \`name\`, \`status\`, and either \`daily_budget_micro\` or \`lifetime_spend_cap_micro\`
- **adGroup**: requires \`campaignId\` + \`name\`, \`status\`, \`type\`, \`placement\`, \`targeting\`, \`optimization_goal\`, and a supported budget field
- **ad**: requires \`adSquadId\` + \`name\`, \`creative_id\`, \`type\`, \`status\`
- **creative**: requires fields matching the chosen creative type, such as \`name\`, \`type\`, \`brand_name\`, \`headline\`, \`call_to_action\`, and media or destination properties

**Parent entity IDs (passed as top-level params, not in data):**
- Creating \`adGroup\`: supply \`campaignId\` (routes to /v1/campaigns/{id}/adsquads)
- Creating \`ad\`: supply \`adSquadId\` (routes to /v1/adsquads/{id}/ads)

**Gotchas:**
- Budget values are in micro-currency (multiply by 1,000,000 — e.g., $10 = 10000000)
- ad_account_id is automatically injected`;

export const CreateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to create"),
    adAccountId: z.string().min(1).describe("Snapchat Advertiser ID"),
    campaignId: z
      .string()
      .optional()
      .describe("Campaign ID — required when entityType is 'adGroup'"),
    adSquadId: z.string().optional().describe("Ad Squad ID — required when entityType is 'ad'"),
    data: z.record(z.any()).describe("Entity fields as key-value pairs"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the creation and returns a DryRunResult under `dryRun` (expected post-state = the would-be-created entity) without calling the Snapchat API. No entity is created."
      ),
  })
  .describe("Parameters for creating a Snapchat Ads entity");

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
  const { snapchatService } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolveSnapchatCreateCapability(input.entityType);

  if (input.dry_run === true) {
    const dryRun = await runSnapchatCreateDryRun(
      { entityType: input.entityType, data: input.data },
      snapchatService,
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

  const filters: Record<string, string> = { adAccountId: input.adAccountId };
  if (input.campaignId) filters.campaignId = input.campaignId;
  if (input.adSquadId) filters.adSquadId = input.adSquadId;

  // Fail fast on an empty or invalid create payload before hitting the API,
  // applying the same symbolic validation the dry-run path uses (finding 6.20).
  if (Object.keys(input.data).length === 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      "`data` must contain at least one field to create a Snapchat entity."
    );
  }
  const createValidationErrors = symbolicValidate(input.data);
  if (createValidationErrors.length > 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Invalid create payload: ${createValidationErrors.map((e) => e.message).join("; ")}`
    );
  }

  const entity = (await snapchatService.createEntity(
    input.entityType as SnapchatEntityType,
    filters,
    input.data,
    context
  )) as unknown as Record<string, unknown>;

  // Normalize the created entity for the canonical `after` snapshot. Create has
  // no `before`. Best-effort: undefined for out-of-scope kinds.
  const createdId = String(entity?.id ?? "");
  const after: NormalizedEntitySnapshot | undefined = snapshotFromSnapchatEntity(
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
      platform: "snapchat",
      contractPlatformSlug: "snapchat",
      contractToolSlug: "create_entity",
      operation: ["create"],
      entityKinds: ["campaign", "ad_group", "ad"],
      entityIdArgs: ["adAccountId"],
      readPartner: {
        toolName: "snapchat_get_entity",
        argMap: { entityType: "entityType", adAccountId: "adAccountId" },
      },
      schemaVersion: 1,
      contractId: "snapchat.create_entity.v1",
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
          name: "Summer Sale 2026",
          objective: "WEB_CONVERSION",
          daily_budget_micro: 10000000,
          status: "ACTIVE",
        },
      },
    },
    {
      label: "Create an ad group",
      input: {
        entityType: "adGroup",
        adAccountId: "1234567890",
        campaignId: "1800123456789",
        data: {
          name: "US 25-44 Interest Targeting",
          placement: "SNAP_ADS",
          type: "SNAP_ADS",
          daily_budget_micro: 5000000,
          optimization_goal: "IMPRESSIONS",
          bid_micro: 1000000,
          status: "ACTIVE",
          targeting: {
            geos: [{ country_code: "us" }],
          },
          start_time: "2026-01-01T00:00:00Z",
          end_time: "2026-12-31T23:59:59Z",
        },
      },
    },
  ],
  logic: createEntityLogic,
  responseFormatter: createEntityResponseFormatter,
};
