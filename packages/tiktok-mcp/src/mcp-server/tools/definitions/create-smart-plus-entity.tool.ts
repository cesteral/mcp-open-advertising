// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  assertAccountScope,
  McpError,
  JsonRpcErrorCode,
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
import {
  getSmartPlusEntityTypeEnum,
  SMART_PLUS_CUTOFF_OBJECTIVES,
  type SmartPlusEntityType,
} from "../utils/smart-plus-mapping.js";
import {
  runSmartPlusCreateDryRun,
  resolveSmartPlusCreateCapability,
  smartPlusCreateErrors,
} from "../utils/smart-plus-dry-run.js";
import { smartPlusIdOf, smartPlusSnapshotFromEntity } from "../utils/smart-plus-snapshot.js";

const TOOL_NAME = "tiktok_create_smart_plus_entity";
const TOOL_TITLE = "Create TikTok Upgraded Smart+ Entity";
const TOOL_DESCRIPTION = `Upgraded Smart+ entity creation for TikTok, through \`/smart_plus/{campaign,adgroup,ad}/create/\`.

From 2027-01-01 the legacy \`tiktok_create_entity\` no longer makes non-Search Sales (\`WEB_CONVERSIONS\`), App Promotion (\`APP_PROMOTION\`) or Lead Generation (\`LEAD_GENERATION\`) entities; use this tool for them. Other objectives (for example \`TRAFFIC\`) are not offered by the Upgraded Smart+ API and stay on \`tiktok_create_entity\`.

**Supported entity types:** ${getSmartPlusEntityTypeEnum().join(", ")}. Order: campaign, ad group (\`campaign_id\`), ad (\`adgroup_id\`). The payload shapes differ from the legacy ones.
- **campaign**: \`campaign_name\`, \`objective_type\` (${SMART_PLUS_CUTOFF_OBJECTIVES.join(", ")}); \`app_promotion_type\` when APP_PROMOTION; \`sales_destination\` when WEB_CONVERSIONS; budget via \`budget_optimize_on\`, \`budget_mode\`, \`budget\`. Returns \`campaign_id\`.
- **adGroup**: \`adgroup_name\`, \`promotion_type\`, \`optimization_goal\`, \`bid_type\`, \`billing_event\`, \`targeting_spec\` (object), \`schedule_type\`, \`schedule_start_time\`, plus conditionals such as \`app_id\`, \`pixel_id\`, \`optimization_event\`. Returns \`adgroup_id\`.
- **ad**: \`creative_list[].creative_info\` (ad_format, video_info / image_info / tiktok_item_id, identity_type, identity_id), \`ad_text_list\`, \`call_to_action_list\`, \`landing_page_url_list\`; at most 30 per ad group. Returns \`smart_plus_ad_id\`, not \`ad_id\`.

**Gotchas:**
- TikTok must have allowlisted the ad account for Upgraded Smart+ management.
- \`request_id\` (TikTok's idempotency key for the first two) is generated when omitted; pass your own to make a retry safe across calls.
- Legacy update tools cannot edit these entities: use \`tiktok_update_smart_plus_entity\`, \`tiktok_update_smart_plus_status\` and \`tiktok_get_smart_plus_entity\`.
- advertiser_id is automatically injected`;

export const CreateSmartPlusEntityInputSchema = z
  .object({
    entityType: z.enum(getSmartPlusEntityTypeEnum()).describe("Type of entity to create"),
    advertiserId: z
      .string()
      .min(1)
      .describe(
        "TikTok Advertiser ID (informational — the session-bound advertiser from authentication is used for API calls)"
      ),
    data: z.record(z.any()).describe("Entity fields as key-value pairs"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the creation and returns a DryRunResult under `dryRun` (expected post-state = the would-be-created entity) without calling the TikTok API. No entity is created."
      ),
  })
  .describe("Parameters for creating a TikTok Upgraded Smart+ entity");

export const CreateSmartPlusEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Created entity data (includes entity ID)"),
    entityType: z.string(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No entity was created."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-create canonical snapshot, normalized from the created entity. Create has no `before`."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to. Present on every response."
    ),
  })
  .describe("Upgraded Smart+ entity creation result");

type CreateSmartPlusEntityInput = z.infer<typeof CreateSmartPlusEntityInputSchema>;
type CreateSmartPlusEntityOutput = z.infer<typeof CreateSmartPlusEntityOutputSchema>;

export async function createSmartPlusEntityLogic(
  input: CreateSmartPlusEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateSmartPlusEntityOutput> {
  const { tiktokService, boundAdvertiserId } = resolveSessionServices(sdkContext);
  const entityType = input.entityType as SmartPlusEntityType;
  const dispatchedCapability = resolveSmartPlusCreateCapability(entityType);

  if (input.dry_run === true) {
    const dryRun = await runSmartPlusCreateDryRun({ entityType, data: input.data }, TOOL_NAME);
    return {
      entity: {},
      entityType,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  // Fail fast on a mismatched account — only on the real-execution path, so a
  // dry-run preview with a different id is allowed (as on the other write tools).
  assertAccountScope(input.advertiserId, boundAdvertiserId, "advertiserId");

  const errors = smartPlusCreateErrors(entityType, input.data);
  if (errors.length > 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Invalid create payload: ${errors.map((e) => e.message).join("; ")}`
    );
  }

  const entity = await tiktokService.createSmartPlusEntity(entityType, input.data, context);

  const after: NormalizedEntitySnapshot | undefined = smartPlusSnapshotFromEntity(
    entityType,
    smartPlusIdOf(entityType, entity),
    entity
  );

  return {
    entity,
    entityType,
    timestamp: new Date().toISOString(),
    ...(after ? { after } : {}),
    dispatchedCapability,
  };
}

export function createSmartPlusEntityResponseFormatter(
  result: CreateSmartPlusEntityOutput
): McpTextContent[] {
  if (result.dryRun) {
    const outcome = result.dryRun.wouldSucceed ? "would succeed" : "would FAIL";
    const errs = result.dryRun.validationErrors.map((e) => e.message).join("; ");
    return [
      {
        type: "text" as const,
        text:
          `Dry-run: creating Upgraded Smart+ ${result.entityType} ${outcome}.` +
          (errs ? `\nValidation: ${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Upgraded Smart+ ${result.entityType} created successfully\n${JSON.stringify(result.entity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const createSmartPlusEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CreateSmartPlusEntityInputSchema,
  outputSchema: CreateSmartPlusEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: true,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "tiktok",
      contractPlatformSlug: "tiktok",
      contractToolSlug: "create_smart_plus_entity",
      operation: ["create"],
      entityKinds: ["campaign", "ad_group", "ad"],
      entityIdArgs: ["advertiserId"],
      readPartner: {
        toolName: "tiktok_get_smart_plus_entity",
        argMap: { entityType: "entityType", advertiserId: "advertiserId" },
      },
      schemaVersion: 1,
      contractId: "tiktok.create_smart_plus_entity.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Create an Upgraded Smart+ Sales (website) campaign",
      input: {
        entityType: "campaign",
        advertiserId: "1234567890",
        data: {
          campaign_name: "Summer Sale 2027",
          objective_type: "WEB_CONVERSIONS",
          sales_destination: "WEBSITE",
          budget_mode: "BUDGET_MODE_DYNAMIC_DAILY_BUDGET",
          budget: 100,
          operation_status: "DISABLE",
        },
      },
    },
    {
      label: "Create an Upgraded Smart+ App Promotion campaign",
      input: {
        entityType: "campaign",
        advertiserId: "1234567890",
        data: {
          campaign_name: "App Install Q1",
          objective_type: "APP_PROMOTION",
          app_promotion_type: "APP_INSTALL",
          budget_optimize_on: true,
          budget_mode: "BUDGET_MODE_DYNAMIC_DAILY_BUDGET",
          budget: 200,
        },
      },
    },
    {
      label: "Create an Upgraded Smart+ ad group (app install)",
      input: {
        entityType: "adGroup",
        advertiserId: "1234567890",
        data: {
          campaign_id: "1800123456789",
          adgroup_name: "US Android",
          app_id: "7000000000000000000",
          promotion_type: "APP_ANDROID",
          optimization_goal: "INSTALL",
          bid_type: "BID_TYPE_NO_BID",
          billing_event: "OCPM",
          schedule_type: "SCHEDULE_START_END",
          schedule_start_time: "2027-01-05 00:00:00",
          schedule_end_time: "2027-03-31 23:59:59",
          targeting_optimization_mode: "AUTOMATIC",
          targeting_spec: {
            location_ids: ["1562822"],
            spc_audience_age: "OVER_EIGHTEEN",
            operating_systems: ["ANDROID"],
          },
        },
      },
    },
  ],
  logic: createSmartPlusEntityLogic,
  responseFormatter: createSmartPlusEntityResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.entity", "$.after"],
    contentBlocks: [0],
  },
};
