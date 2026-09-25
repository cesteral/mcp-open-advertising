// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type PinterestEntityType } from "../utils/entity-mapping.js";
import {
  runPinterestCreateDryRun,
  resolvePinterestCreateCapability,
  symbolicValidate,
} from "../utils/dry-run.js";
import { McpError, JsonRpcErrorCode, assertAccountScope } from "@cesteral/shared";
import { BILLABLE_EVENTS, ENTITY_STATUSES, OBJECTIVE_TYPES } from "../utils/pinterest-fields.js";
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

Campaigns, ad groups and ads are sent to Pinterest's batch create endpoints (\`POST /v5/ad_accounts/{adAccountId}/{campaigns|ad_groups|ads}\`) as a one-item batch; the ad account comes from \`adAccountId\`, not from \`data\`. A creative is a Pin, created with \`POST /v5/pins\`.

**Required fields (Pinterest v5 OpenAPI):**
- **campaign**: \`name\`, \`objective_type\` (${OBJECTIVE_TYPES.join(", ")})
- **adGroup**: \`name\`, \`campaign_id\`, \`billable_event\` (${BILLABLE_EVENTS.join(", ")}). \`budget_in_micro_currency\` is also required unless the campaign uses campaign budget optimization.
- **ad**: \`ad_group_id\`, \`creative_type\` (e.g. REGULAR for an image Pin, VIDEO for a video Pin), \`pin_id\`
- **creative** (Pin): the spec requires nothing, but a Pin needs \`board_id\` and \`media_source\`: \`{"source_type": "image_url", "url": …}\`, or \`{"source_type": "video_id", "media_id": …}\` with the \`mediaId\` from \`pinterest_upload_video\`

**Gotchas:**
- Money is integer micro-currency: 50.00 is \`50000000\` (\`daily_spend_cap\`, \`lifetime_spend_cap\`, \`budget_in_micro_currency\`, \`bid_in_micro_currency\`)
- \`start_time\` and \`end_time\` are integer Unix seconds
- \`targeting_spec\` keys are UPPERCASE (\`LOCATION\`, \`AGE_BUCKET\`, \`GENDER\`, \`INTEREST\`, …)
- \`status\` is one of ${ENTITY_STATUSES.join(", ")}. Create PAUSED and activate after review.
- Pinterest answers a rejected item with HTTP 200 and per-item exceptions; the tool raises them as an error
- Check a payload first with \`pinterest_validate_entity\`. \`dry_run: true\` only checks \`status\` and the budget values.`;

export const CreateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to create"),
    adAccountId: z.string().min(1).describe("Pinterest ad account ID"),
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
  const { pinterestService, boundAdAccountId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.adAccountId, boundAdAccountId, "adAccountId");
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

  // Fail fast on an empty or invalid create payload before hitting the API,
  // applying the same symbolic validation the dry-run path uses (finding 6.20).
  if (Object.keys(input.data).length === 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      "`data` must contain at least one field to create a Pinterest entity."
    );
  }
  const createValidationErrors = symbolicValidate(input.data);
  if (createValidationErrors.length > 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Invalid create payload: ${createValidationErrors.map((e) => e.message).join("; ")}`
    );
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
      label: "Create a paused awareness campaign (50.00/day cap)",
      input: {
        entityType: "campaign",
        adAccountId: "1234567890",
        data: {
          name: "Summer Sale 2026",
          objective_type: "AWARENESS",
          status: "PAUSED",
          daily_spend_cap: 50000000,
        },
      },
    },
    {
      label: "Create an ad group",
      input: {
        entityType: "adGroup",
        adAccountId: "1234567890",
        data: {
          name: "US 25-44 Interest Targeting",
          campaign_id: "626736533506",
          billable_event: "IMPRESSION",
          status: "PAUSED",
          budget_in_micro_currency: 20000000,
          budget_type: "DAILY",
          bid_strategy_type: "AUTOMATIC_BID",
          start_time: 1775001600,
          end_time: 1798761599,
          targeting_spec: {
            LOCATION: ["US"],
            AGE_BUCKET: ["25-34", "35-44"],
          },
        },
      },
    },
    {
      label: "Create an ad for an existing Pin",
      input: {
        entityType: "ad",
        adAccountId: "1234567890",
        data: {
          ad_group_id: "2680060704746",
          creative_type: "REGULAR",
          pin_id: "1234567890123",
          name: "Summer Sale Pin",
          status: "PAUSED",
        },
      },
    },
  ],
  logic: createEntityLogic,
  responseFormatter: createEntityResponseFormatter,
  // The dry run is symbolic over caller data (no read), so $.dryRun is not declared.
  untrustedContent: {
    structuredPaths: ["$.entity", "$.after"],
    contentBlocks: [0],
  },
};
