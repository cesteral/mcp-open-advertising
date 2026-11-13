// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  assertAccountScope,
  elicitBulkDeleteConfirmation,
  elicitBulkStatusChangeConfirmation,
  assertGovernedEffectDryRun,
  EffectResultSchema,
  EffectDryRunResultSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  RequestContext,
  McpTextContent,
  SdkContext,
  EffectResult,
  EffectDryRunResult,
  DispatchedCapability,
  DryRunValidationError,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";
import {
  getSmartPlusEntityTypeEnum,
  type SmartPlusEntityType,
} from "../utils/smart-plus-mapping.js";

const TOOL_NAME = "tiktok_update_smart_plus_status";
const TOOL_TITLE = "TikTok Upgraded Smart+ Status Update";
const EFFECT_KIND = "entity_statuses_updated";
const TOOL_DESCRIPTION = `Enable, pause or delete TikTok Upgraded Smart+ campaigns, ad groups or ads (\`/smart_plus/{campaign,adgroup,ad}/status/update/\`).

**Supported entity types:** ${getSmartPlusEntityTypeEnum().join(", ")}

**Operation status values:**
- **ENABLE** — Activate entities
- **DISABLE** — Pause entities
- **DELETE** — Delete entities (irreversible; asks for confirmation)

Accepts 1-20 IDs per call: \`campaign_ids\`, \`adgroup_ids\` or, for ads, \`smart_plus_ad_ids\` (use the \`smart_plus_ad_id\`, not a legacy \`ad_id\`).`;

export const UpdateSmartPlusStatusInputSchema = z
  .object({
    entityType: z.enum(getSmartPlusEntityTypeEnum()).describe("Type of entities to update"),
    advertiserId: z
      .string()
      .min(1)
      .describe(
        "TikTok Advertiser ID (informational — the session-bound advertiser from authentication is used for API calls)"
      ),
    entityIds: z
      .array(z.string().min(1))
      .min(1)
      .max(20)
      .describe("Array of campaign_id / adgroup_id / smart_plus_ad_id values (max 20)"),
    operationStatus: z.enum(["ENABLE", "DISABLE", "DELETE"]).describe("Target status to apply"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, symbolically validates the batch and returns an EffectDryRunResult under `dryRun` without prompting for confirmation or calling the TikTok API. No statuses are changed."
      ),
  })
  .describe("Parameters for a status update of TikTok Upgraded Smart+ entities");

export const UpdateSmartPlusStatusOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    totalRequested: z.number(),
    successCount: z.number(),
    failureCount: z.number(),
    results: z.array(
      z.object({
        entityId: z.string(),
        success: z.boolean(),
        error: z.string().optional(),
      })
    ),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No statuses were changed."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `entity_statuses_updated` + scalar batch audit summary incl. target_status). Present on a confirmed execute."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `bulk_job` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Upgraded Smart+ status update result");

type UpdateSmartPlusStatusInput = z.infer<typeof UpdateSmartPlusStatusInputSchema>;
type UpdateSmartPlusStatusOutput = z.infer<typeof UpdateSmartPlusStatusOutputSchema>;

export async function updateSmartPlusStatusLogic(
  input: UpdateSmartPlusStatusInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UpdateSmartPlusStatusOutput> {
  // Effect-class write: the batch is governed as one effect, not one canonical entity.
  const dispatchedCapability: DispatchedCapability = {
    operation: "bulk_job",
    canonicalEntityKind: null,
  };

  if (input.dry_run === true) {
    return {
      confirmed: true,
      totalRequested: input.entityIds.length,
      successCount: 0,
      failureCount: 0,
      results: [],
      timestamp: new Date().toISOString(),
      dryRun: buildEffectDryRun(input),
      dispatchedCapability,
    };
  }

  const confirmed =
    input.operationStatus === "DELETE"
      ? await elicitBulkDeleteConfirmation({
          count: input.entityIds.length,
          entityLabel: `Upgraded Smart+ ${input.entityType}`,
          impactPreview: input.entityIds,
          sdkContext,
        })
      : await elicitBulkStatusChangeConfirmation({
          count: input.entityIds.length,
          entityLabel: `Upgraded Smart+ ${input.entityType}`,
          targetStatus: input.operationStatus,
          impactPreview: input.entityIds,
          sdkContext,
        });
  if (!confirmed) {
    return {
      confirmed: false,
      declineReason: "user_declined",
      totalRequested: input.entityIds.length,
      successCount: 0,
      failureCount: 0,
      results: [],
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  const { tiktokService, boundAdvertiserId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.advertiserId, boundAdvertiserId, "advertiserId");

  // The status endpoint takes the whole batch in one request: it either
  // accepts it or fails it, so a failure is reported for every id.
  let error: string | undefined;
  try {
    await tiktokService.updateSmartPlusStatus(
      input.entityType as SmartPlusEntityType,
      input.entityIds,
      input.operationStatus,
      context
    );
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const results = input.entityIds.map((entityId) =>
    error === undefined ? { entityId, success: true } : { entityId, success: false, error }
  );
  const successCount = error === undefined ? input.entityIds.length : 0;
  const failureCount = input.entityIds.length - successCount;

  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      entity_kind: input.entityType,
      requested: input.entityIds.length,
      succeeded: successCount,
      failed: failureCount,
      partial_success: false,
      target_status: input.operationStatus,
    },
  };

  return {
    confirmed: true,
    totalRequested: input.entityIds.length,
    successCount,
    failureCount,
    results,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/** Symbolic effect dry-run: every id non-empty; expected effect is the N-entity status change. Pure. */
function buildEffectDryRun(input: UpdateSmartPlusStatusInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  input.entityIds.forEach((id, i) => {
    if (!id || id.trim().length === 0) {
      validationErrors.push({
        code: "INVALID_ENTITY_ID",
        message: `entityIds[${i}] must be a non-empty entity ID`,
        field: `entityIds.${i}`,
      });
    }
  });

  return assertGovernedEffectDryRun(
    {
      wouldSucceed: validationErrors.length === 0,
      validationErrors,
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect: {
        effectKind: EFFECT_KIND,
        summary: {
          entity_kind: input.entityType,
          requested: input.entityIds.length,
          target_status: input.operationStatus,
        },
      },
    },
    TOOL_NAME,
    { requiresValidation: true, requiresSimulation: true }
  );
}

export function updateSmartPlusStatusResponseFormatter(
  result: UpdateSmartPlusStatusOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedEffectSource } =
      result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    const n = result.dryRun.expectedEffect?.summary.requested ?? 0;
    const status = result.dryRun.expectedEffect?.summary.target_status ?? "?";
    return [
      {
        type: "text" as const,
        text:
          `Dry run: status change of ${String(n)} Upgraded Smart+ entity(s) to ${String(status)} ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No statuses were changed.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Status update cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  const lines: string[] = [
    `Status updates: ${result.successCount}/${result.totalRequested} succeeded, ${result.failureCount} failed`,
    "",
  ];
  for (const r of result.results) {
    lines.push(r.success ? `  ${r.entityId}: SUCCESS` : `  ${r.entityId}: FAILED - ${r.error}`);
  }
  lines.push("", `Timestamp: ${result.timestamp}`);
  return [{ type: "text" as const, text: lines.join("\n") }];
}

export const updateSmartPlusStatusTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UpdateSmartPlusStatusInputSchema,
  outputSchema: UpdateSmartPlusStatusOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: true,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "tiktok",
      contractPlatformSlug: "tiktok",
      contractToolSlug: "update_smart_plus_status",
      operation: ["bulk_job"],
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "tiktok.update_smart_plus_status.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Pause Upgraded Smart+ campaigns",
      input: {
        entityType: "campaign",
        advertiserId: "1234567890",
        entityIds: ["1800111111111", "1800222222222"],
        operationStatus: "DISABLE",
      },
    },
    {
      label: "Enable an Upgraded Smart+ ad",
      input: {
        entityType: "ad",
        advertiserId: "1234567890",
        entityIds: ["1900111111111"],
        operationStatus: "ENABLE",
      },
    },
  ],
  logic: updateSmartPlusStatusLogic,
  responseFormatter: updateSmartPlusStatusResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.results"],
    contentBlocks: [0],
  },
};
