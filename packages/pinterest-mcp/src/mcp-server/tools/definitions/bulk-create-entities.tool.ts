// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { McpError, JsonRpcErrorCode, assertAccountScope } from "@cesteral/shared";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  assertPinterestBulkCapacity,
  pinterestBulkBuckets,
  pinterestBulkCapacityDryRunErrors,
} from "../utils/bulk-capacity.js";
import { getEntityTypeEnum, type PinterestEntityType } from "../utils/entity-mapping.js";
import {
  BulkOperationResultSchema,
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

const TOOL_NAME = "pinterest_bulk_create_entities";
const TOOL_TITLE = "Pinterest Bulk Create Entities";
const TOOL_DESCRIPTION = `Batch create multiple Pinterest Ads entities of the same type.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Each item is the \`data\` object \`pinterest_create_entity\` takes, with the same required fields: a campaign needs \`name\` and \`objective_type\`, an ad group \`name\`, \`campaign_id\` and \`billable_event\`, an ad \`ad_group_id\`, \`creative_type\` and \`pin_id\`. Money is integer micro-currency (50.00 = \`50000000\`) and times are integer Unix seconds. The ad account comes from \`adAccountId\`; do not repeat it per item.

Items are sent one request each, at most 5 at a time. Max 50 items per call. Some items can succeed while others fail: Pinterest answers a rejected item with HTTP 200 and per-item exceptions, which are reported as that item's failure.`;

const EFFECT_KIND = "entities_created";

export const BulkCreateEntitiesInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entities to create"),
    adAccountId: z.string().min(1).describe("Pinterest ad account ID"),
    items: z
      .array(z.record(z.any()))
      .min(1)
      .max(50)
      .describe("Array of entity data objects to create (max 50)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, symbolically validates the batch and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bulk create) without calling the Pinterest API. No entities are created."
      ),
  })
  .describe("Parameters for bulk entity creation");

export const BulkCreateEntitiesOutputSchema = z
  .object({
    totalRequested: z.number(),
    successCount: z.number(),
    failureCount: z.number(),
    results: z.array(
      BulkOperationResultSchema.extend({
        index: z.number(),
      })
    ),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No entities were created."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `entities_created` + scalar batch audit summary). Present on a confirmed execute. A bulk write is governed as a single batch effect — it carries no per-entity canonical snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `bulk_job` with `canonicalEntityKind: null` (effect class; the governed result is the batch effect, not one entity). Present on every response."
    ),
  })
  .describe("Bulk create result");

type BulkCreateEntitiesInput = z.infer<typeof BulkCreateEntitiesInputSchema>;
type BulkCreateEntitiesOutput = z.infer<typeof BulkCreateEntitiesOutputSchema>;

export async function bulkCreateEntitiesLogic(
  input: BulkCreateEntitiesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkCreateEntitiesOutput> {
  // Effect-class write: a bulk batch of N mutations is governed as a single
  // batch effect, not one canonical entity. Snapshot-level bulk governance is
  // deferred to a future `bulkEntity` contract (see project memory).
  const dispatchedCapability: DispatchedCapability = {
    operation: "bulk_job",
    canonicalEntityKind: null,
  };

  // Symbolic dry-run: validate the batch and project the would-be effect. No API call.
  if (input.dry_run === true) {
    const dryRun = buildBulkEffectDryRun(
      input,
      pinterestBulkCapacityDryRunErrors(
        TOOL_NAME,
        input.items.length,
        pinterestBulkBuckets.perItemWrite(input.adAccountId),
        "items"
      )
    );
    return {
      totalRequested: 0,
      successCount: 0,
      failureCount: 0,
      results: [],
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  // Reuse the symbolic batch validator on the execute path: the dry-run
  // branch is opt-in, so without this an empty/degenerate item (Zod's
  // z.record admits {}) would otherwise reach the platform API.
  const preflight = buildBulkEffectDryRun(input);
  if (!preflight.wouldSucceed) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Invalid bulk create payload: ${preflight.validationErrors.map((e) => e.message).join("; ")}`
    );
  }

  // Refuse a batch the rate limiter cannot admit within its queue budget
  // BEFORE the first write.
  assertPinterestBulkCapacity(
    TOOL_NAME,
    input.items.length,
    pinterestBulkBuckets.perItemWrite(input.adAccountId)
  );

  const { pinterestService, boundAdAccountId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.adAccountId, boundAdAccountId, "adAccountId");

  const bulkResult = await pinterestService.bulkCreateEntities(
    input.entityType as PinterestEntityType,
    { adAccountId: input.adAccountId },
    input.items,
    context
  );

  const results = bulkResult.results.map((r, i) => ({
    index: i,
    success: r.success,
    entity: r.entity as Record<string, unknown> | undefined,
    error: r.error,
  }));

  const totalSucceeded = results.filter((r) => r.success).length;
  const failureCount = input.items.length - totalSucceeded;

  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      entity_kind: input.entityType,
      requested: input.items.length,
      succeeded: totalSucceeded,
      failed: failureCount,
      partial_success: totalSucceeded > 0 && failureCount > 0,
    },
  };

  return {
    totalRequested: input.items.length,
    successCount: totalSucceeded,
    failureCount,
    results,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `bulk_create_entities`. Validates the batch
 * (every item must be a non-empty entity object — Zod's `z.record(z.any())`
 * admits `{}`) and projects the would-be effect (an N-item create of one
 * entity kind). Pinterest has no native bulk validate, so both axes are
 * symbolic. Pure (no I/O).
 */
function buildBulkEffectDryRun(
  input: BulkCreateEntitiesInput,
  capacityErrors: DryRunValidationError[] = []
): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [...capacityErrors];
  input.items.forEach((item, i) => {
    if (!item || typeof item !== "object" || Object.keys(item).length === 0) {
      validationErrors.push({
        code: "EMPTY_ITEM",
        message: `items[${i}] must be a non-empty entity object`,
        field: `items.${i}`,
      });
    }
  });

  const expectedEffect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: { entity_kind: input.entityType, requested: input.items.length },
  };

  return assertGovernedEffectDryRun(
    {
      wouldSucceed: validationErrors.length === 0,
      validationErrors,
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect,
    },
    TOOL_NAME,
    { requiresValidation: true, requiresSimulation: true }
  );
}

export function bulkCreateEntitiesResponseFormatter(
  result: BulkCreateEntitiesOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedEffectSource } =
      result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    const n = result.dryRun.expectedEffect?.summary.requested ?? 0;
    const kind = result.dryRun.expectedEffect?.summary.entity_kind ?? "entity";
    return [
      {
        type: "text" as const,
        text:
          `Dry run: bulk-creating ${String(n)} ${String(kind)}(s) ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No entities were created.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  const lines: string[] = [
    `Bulk create: ${result.successCount}/${result.totalRequested} succeeded, ${result.failureCount} failed`,
    "",
  ];

  for (const r of result.results) {
    if (r.success) {
      lines.push(`  [${r.index}]: SUCCESS - ${JSON.stringify(r.entity)}`);
    } else {
      lines.push(`  [${r.index}]: FAILED - ${r.error}`);
    }
  }

  lines.push("", `Timestamp: ${result.timestamp}`);

  return [{ type: "text" as const, text: lines.join("\n") }];
}

export const bulkCreateEntitiesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BulkCreateEntitiesInputSchema,
  outputSchema: BulkCreateEntitiesOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: true,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "pinterest",
      contractPlatformSlug: "pinterest",
      contractToolSlug: "bulk_create_entities",
      operation: ["bulk_job"],
      // Effect-class: a bulk batch is governed as one batch effect (no canonical
      // per-entity snapshot). Snapshot-level bulk governance is a future bulkEntity contract.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "pinterest.bulk_create_entities.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Bulk create paused campaigns",
      input: {
        entityType: "campaign",
        adAccountId: "1234567890",
        items: [
          {
            name: "Campaign A",
            objective_type: "AWARENESS",
            status: "PAUSED",
            daily_spend_cap: 100000000,
          },
          {
            name: "Campaign B",
            objective_type: "WEB_CONVERSION",
            status: "PAUSED",
            daily_spend_cap: 200000000,
          },
        ],
      },
    },
  ],
  logic: bulkCreateEntitiesLogic,
  responseFormatter: bulkCreateEntitiesResponseFormatter,
};
