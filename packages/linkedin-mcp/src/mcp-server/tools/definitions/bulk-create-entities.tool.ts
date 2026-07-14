// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type LinkedInEntityType } from "../utils/entity-mapping.js";
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

const TOOL_NAME = "linkedin_bulk_create_entities";
const TOOL_TITLE = "Bulk Create LinkedIn Ads Entities";
const TOOL_DESCRIPTION = `Batch create multiple LinkedIn Ads entities of the same type.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Creates entities individually with concurrency (max 5 concurrent requests).
Each item must be a complete entity payload (same as linkedin_create_entity data).

**Gotchas:**
- Max 50 items per call.
- Partial failures are allowed — check results for individual errors.`;

const EFFECT_KIND = "entities_created";

export const BulkCreateEntitiesInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entities to create"),
    items: z.array(z.record(z.any())).min(1).max(50).describe("Entity payloads to create (max 50)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, symbolically validates the batch and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bulk create) without calling the LinkedIn API. No entities are created."
      ),
  })
  .describe("Parameters for bulk entity creation");

export const BulkCreateEntitiesOutputSchema = z
  .object({
    results: z.array(BulkOperationResultSchema),
    successCount: z.number(),
    failureCount: z.number(),
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
  .describe("Bulk creation result");

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
    const dryRun = buildBulkEffectDryRun(input);
    return {
      results: [],
      successCount: 0,
      failureCount: 0,
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

  const { linkedInService } = resolveSessionServices(sdkContext);

  const result = await linkedInService.bulkCreateEntities(
    input.entityType as LinkedInEntityType,
    input.items,
    context
  );

  const successCount = result.results.filter((r) => r.success).length;
  const failureCount = result.results.length - successCount;

  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      entity_kind: input.entityType,
      requested: input.items.length,
      succeeded: successCount,
      failed: failureCount,
      partial_success: successCount > 0 && failureCount > 0,
    },
  };

  return {
    results: result.results.map((r) => ({
      success: r.success,
      entity: r.entity as Record<string, unknown> | undefined,
      error: r.error,
    })),
    successCount,
    failureCount,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `bulk_create_entities`. Validates the batch
 * (every item must be a non-empty entity object — Zod's `z.record(z.any())`
 * admits `{}`) and projects the would-be effect (an N-item create of one
 * entity kind). LinkedIn has no native bulk validate, so both axes are symbolic.
 * Pure (no I/O).
 */
function buildBulkEffectDryRun(input: BulkCreateEntitiesInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
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
  return [
    {
      type: "text" as const,
      text: `Bulk create: ${result.successCount} succeeded, ${result.failureCount} failed\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
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
      platform: "linkedin_ads",
      contractPlatformSlug: "linkedin_ads",
      contractToolSlug: "bulk_create_entities",
      operation: ["bulk_job"],
      // Effect-class: a bulk batch is governed as one batch effect (no canonical
      // per-entity snapshot). Snapshot-level bulk governance is a future bulkEntity contract.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "linkedin_ads.bulk_create_entities.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Create multiple campaigns",
      input: {
        entityType: "campaign",
        items: [
          {
            name: "Campaign A",
            campaignGroup: "urn:li:sponsoredCampaignGroup:987654321",
            account: "urn:li:sponsoredAccount:123456789",
            type: "SPONSORED_UPDATES",
            objectiveType: "BRAND_AWARENESS",
            status: "DRAFT",
          },
          {
            name: "Campaign B",
            campaignGroup: "urn:li:sponsoredCampaignGroup:987654321",
            account: "urn:li:sponsoredAccount:123456789",
            type: "SPONSORED_UPDATES",
            objectiveType: "WEBSITE_TRAFFIC",
            status: "DRAFT",
          },
        ],
      },
    },
  ],
  logic: bulkCreateEntitiesLogic,
  responseFormatter: bulkCreateEntitiesResponseFormatter,
};
