// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type GAdsEntityType } from "../utils/entity-mapping.js";
import { addParentValidationIssue } from "../utils/parent-id-validation.js";
import {
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

const TOOL_NAME = "gads_bulk_mutate";
const TOOL_TITLE = "Bulk Mutate Google Ads Entities";
const EFFECT_KIND = "bulk_mutation";
const TOOL_DESCRIPTION = `Execute multiple create/update/remove operations in a single API call.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

All operations must target the same entity type and customer. By default, all operations
succeed or all fail atomically. Set \`partialFailure: true\` to allow partial success.

Each operation object must contain exactly one of:
- \`{ create: { ...fields } }\` — create a new entity
- \`{ update: { ...fields, resourceName: "customers/{id}/{type}/{entityId}" }, updateMask: "field1,field2" }\` — update
- \`{ remove: "customers/{id}/{type}/{entityId}" }\` — remove

Maximum: thousands of operations per call (subject to Google Ads API limits).

**Composite resource names required for:** \`ad\` → use \`customers/{id}/adGroupAds/{adGroupId}~{adId}\`, \`keyword\` → use \`customers/{id}/adGroupCriteria/{adGroupId}~{criterionId}\`.`;

export const BulkMutateInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entities to mutate"),
    customerId: z.string().min(1).describe("Google Ads customer ID (no dashes)"),
    operations: z
      .array(z.record(z.any()))
      .min(1)
      .max(5000)
      .describe("Array of mutate operation objects (create/update/remove)"),
    partialFailure: z
      .boolean()
      .optional()
      .default(false)
      .describe("Allow partial success (default: false = atomic)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, symbolically validates the batch and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bulk mutation) without calling the Google Ads API. No entities are mutated."
      ),
  })
  .superRefine((input, ctx) => {
    addParentValidationIssue(
      ctx,
      input.entityType as GAdsEntityType,
      input as Record<string, unknown>
    );
  })
  .describe("Parameters for bulk mutate operations");

export const BulkMutateOutputSchema = z
  .object({
    mutateResult: z.record(z.any()).describe("Full mutate response"),
    operationCount: z.number(),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No entities were mutated."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `bulk_mutation` + scalar batch audit summary). Present on a confirmed execute. A bulk mutation is governed as a single batch effect — it carries no per-entity canonical snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `bulk_job` with `canonicalEntityKind: null` (effect class; the governed result is the batch effect, not one entity). Present on every response."
    ),
  })
  .describe("Bulk mutate result");

type BulkMutateInput = z.infer<typeof BulkMutateInputSchema>;
type BulkMutateOutput = z.infer<typeof BulkMutateOutputSchema>;

export async function bulkMutateLogic(
  input: BulkMutateInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkMutateOutput> {
  // Effect-class write: a bulk batch of N mutate operations is governed as a
  // single batch effect, not one canonical entity. Snapshot-level bulk
  // governance is deferred to a future `bulkEntity` contract (see project memory).
  const dispatchedCapability: DispatchedCapability = {
    operation: "bulk_job",
    canonicalEntityKind: null,
  };

  // Symbolic dry-run: validate the batch and project the would-be effect. No
  // API call.
  if (input.dry_run === true) {
    const dryRun = buildBulkEffectDryRun(input);
    return {
      mutateResult: {},
      operationCount: 0,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const { gadsService } = resolveSessionServices(sdkContext);

  const result = await gadsService.bulkMutate(
    input.entityType as GAdsEntityType,
    input.customerId,
    input.operations,
    input.partialFailure,
    context
  );

  // Google Ads can return HTTP 200 with per-operation failures — especially
  // under partialFailure:true, where the whole batch (or every op) can fail
  // while the request itself "succeeds". Parse the response so the effect
  // summary records real applied/failed counts instead of overstating a
  // completed mutation.
  const { succeeded, failed } = summarizeBulkMutateResult(result, input.operations.length);

  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      entity_kind: input.entityType,
      requested: input.operations.length,
      succeeded,
      failed,
      partial_success: succeeded > 0 && failed > 0,
      partial_failure: input.partialFailure,
    },
  };

  return {
    mutateResult: result as Record<string, any>,
    operationCount: input.operations.length,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Derive applied/failed counts from a Google Ads `:mutate` response. The
 * response carries one `results[]` entry per operation, in order; a successful
 * operation has a non-empty `resourceName`, a failed one is an empty object
 * (under partialFailure:true). When `results` is absent we fall back to the
 * `partialFailureError` operation indices, and finally — atomic-mode success
 * path, where any failure would have thrown before we got here — assume all
 * requested operations applied. Pure (no I/O).
 */
function summarizeBulkMutateResult(
  result: unknown,
  requested: number
): { succeeded: number; failed: number } {
  const r = (result ?? {}) as Record<string, unknown>;

  const results = Array.isArray(r.results) ? (r.results as Array<unknown>) : null;
  if (results) {
    let succeeded = 0;
    for (const item of results) {
      const resourceName =
        item && typeof item === "object"
          ? (item as Record<string, unknown>).resourceName
          : undefined;
      if (typeof resourceName === "string" && resourceName.length > 0) succeeded++;
    }
    return { succeeded, failed: results.length - succeeded };
  }

  // No results array — infer failed operation indices from the partial-failure error.
  const failedIndices = extractFailedOperationIndices(r.partialFailureError);
  if (failedIndices !== null) {
    const failed = Math.min(requested, failedIndices.size);
    return { succeeded: Math.max(0, requested - failed), failed };
  }

  // Atomic-mode success path: no per-op failures could have reached this point.
  return { succeeded: requested, failed: 0 };
}

/**
 * Collect the distinct `operations[]` indices referenced by a Google Ads
 * `partialFailureError` (a google.rpc.Status whose details carry GoogleAdsFailure
 * entries). Returns null when the shape can't be interpreted. Pure (no I/O).
 */
function extractFailedOperationIndices(partialFailureError: unknown): Set<number> | null {
  if (!partialFailureError || typeof partialFailureError !== "object") return null;
  const details = (partialFailureError as Record<string, unknown>).details;
  if (!Array.isArray(details)) return null;

  const indices = new Set<number>();
  for (const detail of details) {
    const errors =
      detail && typeof detail === "object" ? (detail as Record<string, unknown>).errors : undefined;
    if (!Array.isArray(errors)) continue;
    for (const err of errors) {
      const fieldPathElements = (err as Record<string, any>)?.location?.fieldPathElements;
      if (!Array.isArray(fieldPathElements)) continue;
      for (const el of fieldPathElements) {
        if (
          el &&
          typeof el === "object" &&
          (el as Record<string, unknown>).fieldName === "operations" &&
          typeof (el as Record<string, unknown>).index === "number"
        ) {
          indices.add((el as Record<string, number>).index);
        }
      }
    }
  }
  return indices;
}

/**
 * Symbolic effect dry-run for `bulk_mutate`. Validates the batch (each operation
 * must be a non-empty object carrying exactly one of create/update/remove) and
 * projects the would-be effect (an N-operation bulk mutation of one entity kind).
 * Google Ads exposes no native validate for this raw-operations path, so both
 * axes are symbolic. Pure (no I/O).
 */
function buildBulkEffectDryRun(input: BulkMutateInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  input.operations.forEach((op, i) => {
    if (!op || typeof op !== "object" || Object.keys(op).length === 0) {
      validationErrors.push({
        code: "EMPTY_OPERATION",
        message: `operations[${i}] must be a non-empty mutate operation`,
        field: `operations.${i}`,
      });
      return;
    }
    const verbs = ["create", "update", "remove"].filter((v) => v in op);
    if (verbs.length !== 1) {
      validationErrors.push({
        code: "INVALID_OPERATION",
        message: `operations[${i}] must contain exactly one of create/update/remove (found: ${verbs.length === 0 ? "none" : verbs.join(", ")})`,
        field: `operations.${i}`,
      });
    }
  });

  const expectedEffect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      entity_kind: input.entityType,
      requested: input.operations.length,
      partial_failure: input.partialFailure,
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

export function bulkMutateResponseFormatter(result: BulkMutateOutput): McpTextContent[] {
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
          `Dry run: bulk mutation of ${String(n)} ${String(kind)} operation(s) ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No entities were mutated.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Bulk mutate completed: ${result.operationCount} operations\n${JSON.stringify(result.mutateResult, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const bulkMutateTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BulkMutateInputSchema,
  outputSchema: BulkMutateOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "google_ads",
      contractPlatformSlug: "google_ads",
      contractToolSlug: "bulk_mutate",
      operation: ["bulk_job"],
      // Effect-class: a bulk batch is governed as one batch effect (no canonical
      // per-entity snapshot). Snapshot-level bulk governance is a future bulkEntity contract.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "google_ads.bulk_mutate.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Batch create ad groups",
      input: {
        entityType: "adGroup",
        customerId: "1234567890",
        operations: [
          {
            create: {
              name: "Brand Terms",
              campaign: "customers/1234567890/campaigns/123456",
              type: "SEARCH_STANDARD",
              status: "PAUSED",
              cpcBidMicros: "1500000",
            },
          },
          {
            create: {
              name: "Generic Terms",
              campaign: "customers/1234567890/campaigns/123456",
              type: "SEARCH_STANDARD",
              status: "PAUSED",
              cpcBidMicros: "2000000",
            },
          },
        ],
      },
    },
    {
      label: "Mixed operations with partial failure",
      input: {
        entityType: "campaign",
        customerId: "1234567890",
        operations: [
          {
            update: {
              resourceName: "customers/1234567890/campaigns/111",
              name: "Updated Campaign Name",
            },
            updateMask: "name",
          },
          { remove: "customers/1234567890/campaigns/222" },
        ],
        partialFailure: true,
      },
    },
  ],
  logic: bulkMutateLogic,
  responseFormatter: bulkMutateResponseFormatter,
};
