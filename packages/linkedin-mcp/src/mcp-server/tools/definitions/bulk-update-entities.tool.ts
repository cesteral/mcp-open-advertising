// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type LinkedInEntityType } from "../utils/entity-mapping.js";
import {
  BulkOperationResultSchema,
  elicitBulkMutationConfirmation,
  hasSensitiveBulkField,
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

const TOOL_NAME = "linkedin_bulk_update_entities";
const TOOL_TITLE = "Bulk Update LinkedIn Ads Entities";
const TOOL_DESCRIPTION = `Batch update multiple LinkedIn Ads entities with arbitrary data.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Each item must include \`entityUrn\` and \`data\` to update.
Updates are applied individually with concurrency (max 5 concurrent).

**Gotchas:**
- Max 50 items per call.
- Partial failures are allowed — check results for individual errors.`;

const EFFECT_KIND = "entities_updated";

export const BulkUpdateEntitiesInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entities to update"),
    items: z
      .array(
        z.object({
          entityUrn: z.string().describe("Entity URN to update"),
          data: z.record(z.any()).describe("Fields to update"),
        })
      )
      .min(1)
      .max(50)
      .describe("Update items (max 50)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, symbolically validates the batch and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bulk update) without prompting for confirmation or calling the LinkedIn API. No entities are updated."
      ),
  })
  .describe("Parameters for bulk entity updates");

export const BulkUpdateEntitiesOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    results: z.array(
      BulkOperationResultSchema.extend({
        entityUrn: z.string(),
      })
    ),
    successCount: z.number(),
    failureCount: z.number(),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No entities were updated."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `entities_updated` + scalar batch audit summary). Present on a confirmed execute. A bulk write is governed as a single batch effect — it carries no per-entity canonical snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `bulk_job` with `canonicalEntityKind: null` (effect class; the governed result is the batch effect, not one entity). Present on every response."
    ),
  })
  .describe("Bulk update result");

type BulkUpdateEntitiesInput = z.infer<typeof BulkUpdateEntitiesInputSchema>;
type BulkUpdateEntitiesOutput = z.infer<typeof BulkUpdateEntitiesOutputSchema>;

export async function bulkUpdateEntitiesLogic(
  input: BulkUpdateEntitiesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkUpdateEntitiesOutput> {
  // Effect-class write: a bulk batch of N mutations is governed as a single
  // batch effect, not one canonical entity. Snapshot-level bulk governance is
  // deferred to a future `bulkEntity` contract (see project memory).
  const dispatchedCapability: DispatchedCapability = {
    operation: "bulk_job",
    canonicalEntityKind: null,
  };

  // Symbolic dry-run: validate the batch and project the would-be effect. No
  // confirmation prompt, no API call.
  if (input.dry_run === true) {
    const dryRun = buildBulkEffectDryRun(input);
    return {
      confirmed: true,
      results: [],
      successCount: 0,
      failureCount: 0,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const payloads = input.items.map((it) => it.data ?? {});
  const confirmed = await elicitBulkMutationConfirmation({
    count: input.items.length,
    entityLabel: input.entityType,
    summary: "Applying field updates across multiple LinkedIn Ads entities.",
    hasSensitiveFieldChange: hasSensitiveBulkField(payloads),
    impactPreview: input.items.map((it) => it.entityUrn),
    sdkContext,
  });
  if (!confirmed) {
    return {
      confirmed: false,
      declineReason: "user_declined",
      results: [],
      successCount: 0,
      failureCount: 0,
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  const { linkedInService } = resolveSessionServices(sdkContext);

  const result = await linkedInService.bulkUpdateEntities(
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
    confirmed: true,
    results: result.results,
    successCount,
    failureCount,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `bulk_update_entities`. Validates the batch (every
 * item must target a non-empty entityUrn and carry a non-empty data payload) and
 * projects the would-be effect (an N-item update of one entity kind). LinkedIn
 * has no native bulk validate, so both axes are symbolic. Pure (no I/O).
 */
function buildBulkEffectDryRun(input: BulkUpdateEntitiesInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  input.items.forEach((item, i) => {
    if (!item.entityUrn || item.entityUrn.trim().length === 0) {
      validationErrors.push({
        code: "INVALID_ENTITY_URN",
        message: `items[${i}].entityUrn must be a non-empty entity URN`,
        field: `items.${i}.entityUrn`,
      });
    }
    if (!item.data || typeof item.data !== "object" || Object.keys(item.data).length === 0) {
      validationErrors.push({
        code: "EMPTY_UPDATE",
        message: `items[${i}].data must contain at least one field to update`,
        field: `items.${i}.data`,
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

export function bulkUpdateEntitiesResponseFormatter(
  result: BulkUpdateEntitiesOutput
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
          `Dry run: bulk-updating ${String(n)} ${String(kind)}(s) ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No entities were updated.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Bulk update cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Bulk update: ${result.successCount} succeeded, ${result.failureCount} failed\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const bulkUpdateEntitiesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BulkUpdateEntitiesInputSchema,
  outputSchema: BulkUpdateEntitiesOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: true,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "linkedin_ads",
      contractPlatformSlug: "linkedin_ads",
      contractToolSlug: "bulk_update_entities",
      operation: ["bulk_job"],
      // Effect-class: a bulk batch is governed as one batch effect (no canonical
      // per-entity snapshot). Snapshot-level bulk governance is a future bulkEntity contract.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "linkedin_ads.bulk_update_entities.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Update daily budgets for multiple campaigns",
      input: {
        entityType: "campaign",
        items: [
          {
            entityUrn: "urn:li:sponsoredCampaign:111111111",
            data: { dailyBudget: { amount: "75.00", currencyCode: "USD" } },
          },
          {
            entityUrn: "urn:li:sponsoredCampaign:222222222",
            data: { dailyBudget: { amount: "100.00", currencyCode: "USD" } },
          },
        ],
      },
    },
  ],
  logic: bulkUpdateEntitiesLogic,
  responseFormatter: bulkUpdateEntitiesResponseFormatter,
};
