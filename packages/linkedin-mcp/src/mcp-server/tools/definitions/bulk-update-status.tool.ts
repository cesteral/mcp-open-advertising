// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type LinkedInEntityType } from "../utils/entity-mapping.js";
import {
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

const TOOL_NAME = "linkedin_bulk_update_status";
const TOOL_TITLE = "Bulk Update LinkedIn Ads Entity Status";
const EFFECT_KIND = "entity_statuses_updated";
const TOOL_DESCRIPTION = `Batch update status for multiple LinkedIn Ads entities.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**Valid statuses:** ACTIVE, PAUSED, DRAFT, ARCHIVED, CANCELED

**Gotchas:**
- ARCHIVED entities cannot be reactivated.
- Campaign groups must be paused before archiving.
- Max 50 entities per call.
- Each update consumes 3x rate limit tokens (write operation).`;

export const BulkUpdateStatusInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entities to update"),
    entityUrns: z.array(z.string()).min(1).max(50).describe("Entity URNs to update (max 50)"),
    status: z.enum(["ACTIVE", "PAUSED", "DRAFT", "ARCHIVED", "CANCELED"]).describe("Target status"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, symbolically validates the batch and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bulk status change) without prompting for confirmation or calling the LinkedIn API. No statuses are changed."
      ),
  })
  .describe("Parameters for bulk status update");

export const BulkUpdateStatusOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    results: z.array(
      z.object({
        entityUrn: z.string(),
        success: z.boolean(),
        error: z.string().optional(),
      })
    ),
    successCount: z.number(),
    failureCount: z.number(),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No statuses were changed."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `entity_statuses_updated` + scalar batch audit summary incl. target_status). Present on a confirmed execute. A bulk status change is governed as a single batch effect — it carries no per-entity canonical snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `bulk_job` with `canonicalEntityKind: null` (effect class; the governed result is the batch effect, not one entity). Present on every response."
    ),
  })
  .describe("Bulk status update result");

type BulkUpdateStatusInput = z.infer<typeof BulkUpdateStatusInputSchema>;
type BulkUpdateStatusOutput = z.infer<typeof BulkUpdateStatusOutputSchema>;

export async function bulkUpdateStatusLogic(
  input: BulkUpdateStatusInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkUpdateStatusOutput> {
  // Effect-class write: a bulk batch of N status changes is governed as a single
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

  const confirmed = await elicitBulkStatusChangeConfirmation({
    count: input.entityUrns.length,
    entityLabel: input.entityType,
    targetStatus: input.status,
    impactPreview: input.entityUrns,
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

  const result = await linkedInService.bulkUpdateStatus(
    input.entityType as LinkedInEntityType,
    input.entityUrns,
    input.status,
    context
  );

  const successCount = result.results.filter((r) => r.success).length;
  const failureCount = result.results.length - successCount;

  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      entity_kind: input.entityType,
      requested: input.entityUrns.length,
      succeeded: successCount,
      failed: failureCount,
      partial_success: successCount > 0 && failureCount > 0,
      target_status: input.status,
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
 * Symbolic effect dry-run for `bulk_update_status`. Validates the batch (every
 * entity URN must be non-empty) and projects the would-be effect (an N-entity
 * status change to one target status). LinkedIn has no native bulk validate, so
 * both axes are symbolic. Pure (no I/O).
 */
function buildBulkEffectDryRun(input: BulkUpdateStatusInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  input.entityUrns.forEach((urn, i) => {
    if (!urn || urn.trim().length === 0) {
      validationErrors.push({
        code: "INVALID_ENTITY_URN",
        message: `entityUrns[${i}] must be a non-empty entity URN`,
        field: `entityUrns.${i}`,
      });
    }
  });

  const expectedEffect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      entity_kind: input.entityType,
      requested: input.entityUrns.length,
      target_status: input.status,
    },
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

export function bulkUpdateStatusResponseFormatter(
  result: BulkUpdateStatusOutput
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
          `Dry run: bulk status change of ${String(n)} entity(s) to ${String(status)} ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No statuses were changed.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Bulk status update cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Bulk status update: ${result.successCount} succeeded, ${result.failureCount} failed\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const bulkUpdateStatusTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BulkUpdateStatusInputSchema,
  outputSchema: BulkUpdateStatusOutputSchema,
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
      contractToolSlug: "bulk_update_status",
      operation: ["bulk_job"],
      // Effect-class: a bulk batch is governed as one batch effect (no canonical
      // per-entity snapshot). Snapshot-level bulk governance is a future bulkEntity contract.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "linkedin_ads.bulk_update_status.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Pause multiple campaigns",
      input: {
        entityType: "campaign",
        entityUrns: ["urn:li:sponsoredCampaign:111111111", "urn:li:sponsoredCampaign:222222222"],
        status: "PAUSED",
      },
    },
  ],
  logic: bulkUpdateStatusLogic,
  responseFormatter: bulkUpdateStatusResponseFormatter,
};
