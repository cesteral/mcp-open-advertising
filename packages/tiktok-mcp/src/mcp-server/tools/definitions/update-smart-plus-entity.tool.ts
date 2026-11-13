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
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";
import {
  getSmartPlusEntityTypeEnum,
  type SmartPlusEntityType,
} from "../utils/smart-plus-mapping.js";
import {
  runSmartPlusUpdateDryRun,
  resolveSmartPlusUpdateCapability,
  smartPlusUpdateErrors,
} from "../utils/smart-plus-dry-run.js";
import {
  captureSmartPlusEntity,
  smartPlusSnapshotFromEntity,
} from "../utils/smart-plus-snapshot.js";

const TOOL_NAME = "tiktok_update_smart_plus_entity";
const TOOL_TITLE = "Update TikTok Upgraded Smart+ Entity";
const TOOL_DESCRIPTION = `Update a TikTok Upgraded Smart+ campaign, ad group or ad (\`/smart_plus/{campaign,adgroup,ad}/update/\`).

**Supported entity types:** ${getSmartPlusEntityTypeEnum().join(", ")}

The legacy \`tiktok_update_entity\` cannot edit Upgraded Smart+ entities (TikTok's \`{campaign,adgroup,ad}/update/\` refuse them), so use this tool. The entity ID goes in the body as \`campaign_id\`, \`adgroup_id\` or \`smart_plus_ad_id\`, set from \`entityId\`; put the fields to change in \`data\`.

**Gotchas:**
- Status changes (pause, resume, delete) are not update fields: use \`tiktok_update_smart_plus_status\`.
- Several fields cannot be changed once set (for example a campaign's \`budget_mode\`, \`sales_destination\` and \`is_search_campaign\`).
- advertiser_id is automatically injected`;

export const UpdateSmartPlusEntityInputSchema = z
  .object({
    entityType: z.enum(getSmartPlusEntityTypeEnum()).describe("Type of entity to update"),
    advertiserId: z.string().min(1).describe("TikTok Advertiser ID"),
    entityId: z
      .string()
      .min(1)
      .describe("The campaign_id, adgroup_id or smart_plus_ad_id to update"),
    data: z.record(z.any()).describe("Fields to update as key-value pairs"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the proposed mutation and returns a DryRunResult under `dryRun` without invoking the TikTok update. The entity is never modified."
      ),
  })
  .describe("Parameters for updating a TikTok Upgraded Smart+ entity");

export const UpdateSmartPlusEntityOutputSchema = z
  .object({
    entityId: z.string(),
    entityType: z.string(),
    updated: z.boolean(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. The mutation was NOT applied."
    ),
    before: NormalizedEntitySnapshotSchema.optional().describe(
      "Pre-write canonical snapshot, captured at the start of the handler. Undefined when the pre-read fails."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-write canonical snapshot, normalized from the entity the update returns (re-read fallback). Undefined when both fail."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to. Present on every response."
    ),
  })
  .describe("Upgraded Smart+ entity update result");

type UpdateSmartPlusEntityInput = z.infer<typeof UpdateSmartPlusEntityInputSchema>;
type UpdateSmartPlusEntityOutput = z.infer<typeof UpdateSmartPlusEntityOutputSchema>;

export async function updateSmartPlusEntityLogic(
  input: UpdateSmartPlusEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UpdateSmartPlusEntityOutput> {
  const { tiktokService, boundAdvertiserId } = resolveSessionServices(sdkContext);
  const entityType = input.entityType as SmartPlusEntityType;
  const dispatchedCapability = resolveSmartPlusUpdateCapability(entityType, input.data);

  if (input.dry_run === true) {
    const dryRun = await runSmartPlusUpdateDryRun(
      { entityType, entityId: input.entityId, data: input.data },
      tiktokService,
      context,
      TOOL_NAME
    );
    return {
      entityId: input.entityId,
      entityType,
      updated: false,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  assertAccountScope(input.advertiserId, boundAdvertiserId, "advertiserId");

  if (Object.keys(input.data).length === 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      "`data` must contain at least one field to update a TikTok Upgraded Smart+ entity."
    );
  }
  const errors = smartPlusUpdateErrors(input.data);
  if (errors.length > 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Invalid update payload: ${errors.map((e) => e.message).join("; ")}`
    );
  }

  const pre = await captureSmartPlusEntity(tiktokService, entityType, input.entityId, context);
  const before = pre?.snapshot;

  const updated = await tiktokService.updateSmartPlusEntity(
    entityType,
    input.entityId,
    input.data,
    context
  );

  let after = smartPlusSnapshotFromEntity(entityType, input.entityId, updated ?? {});
  if (!after) {
    after = (await captureSmartPlusEntity(tiktokService, entityType, input.entityId, context))
      ?.snapshot;
  }

  return {
    entityId: input.entityId,
    entityType,
    updated: true,
    timestamp: new Date().toISOString(),
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    dispatchedCapability,
  };
}

export function updateSmartPlusEntityResponseFormatter(
  result: UpdateSmartPlusEntityOutput
): McpTextContent[] {
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
      text: `Upgraded Smart+ ${result.entityType} ${result.entityId} updated successfully\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const updateSmartPlusEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UpdateSmartPlusEntityInputSchema,
  outputSchema: UpdateSmartPlusEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "tiktok",
      contractPlatformSlug: "tiktok",
      contractToolSlug: "update_smart_plus_entity",
      // Status changes are not an update field here (they go through
      // tiktok_update_smart_plus_status), so the contract advertises the field
      // updates only.
      operation: ["update_budget", "update"],
      entityKinds: ["campaign", "ad_group", "ad"],
      entityIdArgs: ["entityId"],
      readPartner: {
        toolName: "tiktok_get_smart_plus_entity",
        argMap: { entityType: "entityType", advertiserId: "advertiserId", entityId: "entityId" },
      },
      schemaVersion: 1,
      contractId: "tiktok.update_smart_plus_entity.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Rename an Upgraded Smart+ campaign and change its budget",
      input: {
        entityType: "campaign",
        advertiserId: "1234567890",
        entityId: "1800123456789",
        data: { campaign_name: "Summer Sale 2027 (v2)", budget: 150 },
      },
    },
    {
      label: "Change an Upgraded Smart+ ad group's end time",
      input: {
        entityType: "adGroup",
        advertiserId: "1234567890",
        entityId: "1700123456789",
        data: { schedule_end_time: "2027-04-30 23:59:59" },
      },
    },
  ],
  logic: updateSmartPlusEntityLogic,
  responseFormatter: updateSmartPlusEntityResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.dryRun", "$.before", "$.after"],
    contentBlocks: [],
  },
};
