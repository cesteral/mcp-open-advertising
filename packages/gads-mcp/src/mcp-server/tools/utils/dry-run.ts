// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Dry-run helpers for the Google Ads `update_entity` tool. R2-U3 wiring.
 *
 * Google Ads exposes a NATIVE validate-only path: the `:mutate` endpoint
 * accepts `validateOnly: true`, which runs the platform's own server-side
 * validation of the mutation with no side effects. The dry-run wraps that —
 * so the validation axis is genuinely platform-validated, not symbolic:
 *
 * - **Validation** calls `GAdsService.validateEntity` (native `validateOnly`).
 *   `validationSource: "native_validator"`.
 * - **Expected post-state** is symbolic: the native validate call does not
 *   echo back the simulated entity, so the expected state is computed by
 *   reading the current entity through the read partner and overlaying the
 *   masked patch fields. `expectedStateSource: "server_symbolic_apply"`.
 */

import { assertGovernedDryRunResult } from "@cesteral/shared";
import type {
  DispatchedCapability,
  DryRunResult,
  DryRunValidationError,
  NormalizedEntitySnapshot,
  RequestContext,
} from "@cesteral/shared";
import {
  buildGAdsSnapshot,
  captureGAdsSnapshot,
  ENTITY_KIND_MAP,
  unwrapResource,
  type GAdsServiceLike,
} from "./capture-snapshot.js";

export type { GAdsServiceLike };

/**
 * Service surface the dry-run needs: the native `validateEntity` (validateOnly)
 * call plus the read partner's `getEntity`. `GAdsService` satisfies this
 * structurally.
 */
export interface GAdsDryRunServiceLike extends GAdsServiceLike {
  validateEntity?: (
    entityType: any,
    customerId: string,
    data: Record<string, unknown>,
    mode: "create" | "update" | "remove",
    entityId?: string,
    updateMask?: string,
    context?: RequestContext
  ) => Promise<{ valid: boolean; errors?: string[] }>;
}

/**
 * Symbolic apply: overlay the fields named in `updateMask` from `data` onto a
 * clone of `preState`, then normalize. Pure (no I/O). Used by the testkit's
 * `assertContract` against fixture pairs and mirrors what the dry-run handler
 * does in-tool. Google Ads update payloads are flat, so each `updateMask`
 * entry is a top-level field name.
 */
export function applyGAdsPatch(
  entityType: string,
  customerId: string,
  entityId: string,
  preState: Record<string, unknown>,
  data: Record<string, unknown>,
  updateMask: string
): NormalizedEntitySnapshot | undefined {
  const applied: Record<string, any> = structuredClone(preState);
  const maskFields = updateMask
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  for (const field of maskFields) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      applied[field] = (data as Record<string, any>)[field];
    }
  }
  const snapshot = buildGAdsSnapshot(entityType, customerId, entityId, applied);
  return snapshot ?? undefined;
}

/**
 * Resolve the concrete `(operation, entityKind)` a `gads_update_entity` call
 * dispatches to, from its `data` payload. The tool is a multi-operation
 * dispatcher; governance requires every response to name the capability the
 * call exercised. Pure (no I/O).
 */
export function resolveGAdsDispatchedCapability(
  entityType: string,
  data: Record<string, unknown>
): DispatchedCapability {
  const status = typeof data.status === "string" ? data.status : undefined;
  let operation: string;
  if (status === "ENABLED") {
    operation = "resume";
  } else if (status === "PAUSED") {
    operation = "pause";
  } else if (status) {
    // REMOVED and any other status transition.
    operation = "update_status";
  } else if ("amountMicros" in data) {
    // Budget lives on the campaignBudget entity (`amountMicros`).
    operation = "update_budget";
  } else {
    operation = "update";
  }
  return {
    operation,
    canonicalEntityKind: ENTITY_KIND_MAP[entityType] || entityType || "unknown",
  };
}

/**
 * Resolve the `(operation, entityKind)` for a `gads_remove_entity` call.
 * Out-of-scope types (ad, keyword) resolve to `canonicalEntityKind: null` —
 * still token-gated under enforce, no canonical snapshot. Pure.
 */
export function resolveGAdsRemoveCapability(entityType: string): DispatchedCapability {
  return {
    operation: "delete",
    canonicalEntityKind: ENTITY_KIND_MAP[entityType] ?? null,
  };
}

export interface GAdsRemoveDryRunArgs {
  entityType: string;
  customerId: string;
  entityId: string;
}

/**
 * Dry-run for `gads_remove_entity`. Validation is NATIVE — Google Ads `:mutate`
 * with `validateOnly: true` on a `remove` operation, so platform-side rejections
 * (e.g. removing an entity that cannot be removed) are caught in the dry-run
 * rather than surfacing only on execute. Expected post-state is symbolic: the
 * current entity with canonical status `deleted` (Google Ads `REMOVED`).
 *
 * A failed validate *verdict* is a normal dry-run result; a *thrown* validate
 * call propagates (governed dry-run must never report validationSource "none").
 */
export async function runGAdsRemoveDryRun(
  args: GAdsRemoveDryRunArgs,
  gadsService: GAdsDryRunServiceLike,
  context: RequestContext
): Promise<DryRunResult> {
  // ── Validation: native Google Ads validateOnly on a remove operation ──
  let validationErrors: DryRunValidationError[] = [];
  let validationSource: DryRunResult["validationSource"] = "none";
  if (gadsService.validateEntity) {
    const verdict = await gadsService.validateEntity(
      args.entityType,
      args.customerId,
      {},
      "remove",
      args.entityId,
      undefined,
      context
    );
    validationSource = "native_validator";
    if (!verdict.valid) {
      validationErrors = (
        verdict.errors && verdict.errors.length > 0
          ? verdict.errors
          : ["Google Ads rejected the removal"]
      ).map((message) => ({ code: "GOOGLE_ADS_VALIDATION", message }));
    }
  }

  // ── Expected post-state: symbolic (entity with canonical status `deleted`) ──
  const before = await captureGAdsSnapshot(
    gadsService,
    args.entityType,
    args.customerId,
    args.entityId,
    context
  );
  const expectedPostState: NormalizedEntitySnapshot | undefined = before
    ? { ...before, status: { canonical: "deleted", platformRaw: "REMOVED" } }
    : undefined;

  return assertGovernedDryRunResult(
    {
      wouldSucceed: validationErrors.length === 0 && expectedPostState !== undefined,
      validationErrors,
      validationSource,
      expectedStateSource: expectedPostState ? "server_symbolic_apply" : "none",
      ...(expectedPostState ? { expectedPostState } : {}),
    },
    "gads_remove_entity"
  );
}

export interface GAdsDryRunArgs {
  entityType: string;
  customerId: string;
  entityId: string;
  data: Record<string, unknown>;
  updateMask: string;
}

export async function runGAdsUpdateDryRun(
  input: GAdsDryRunArgs,
  gadsService: GAdsDryRunServiceLike,
  context: RequestContext
): Promise<DryRunResult> {
  // ── Validation: native Google Ads `validateOnly` on the :mutate endpoint ──
  // A failed validateOnly *verdict* (`{ valid: false }`) is a normal, contract-
  // honoring dry-run result. A *thrown* validateOnly call (network / auth /
  // rate limit) means validation could not run at all — it propagates, failing
  // the call, because a governed dry-run must never report validationSource
  // "none" (see assertGovernedDryRunResult below).
  let validationErrors: DryRunValidationError[] = [];
  let validationSource: DryRunResult["validationSource"] = "none";
  if (gadsService.validateEntity) {
    const verdict = await gadsService.validateEntity(
      input.entityType,
      input.customerId,
      input.data,
      "update",
      input.entityId,
      input.updateMask,
      context
    );
    validationSource = "native_validator";
    if (!verdict.valid) {
      validationErrors = (
        verdict.errors && verdict.errors.length > 0
          ? verdict.errors
          : ["Google Ads rejected the mutation"]
      ).map((message) => ({ code: "GOOGLE_ADS_VALIDATION", message }));
    }
  }

  // ── Expected post-state: symbolic apply over the read-partner snapshot ──
  // A read failure propagates for the same reason.
  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";
  if (ENTITY_KIND_MAP[input.entityType] && gadsService.getEntity) {
    const row = (await gadsService.getEntity(
      input.entityType,
      input.customerId,
      input.entityId,
      context
    )) as Record<string, unknown> | undefined;
    if (row && typeof row === "object") {
      const resource = unwrapResource(input.entityType, row);
      if (resource) {
        const snapshot = applyGAdsPatch(
          input.entityType,
          input.customerId,
          input.entityId,
          resource,
          input.data,
          input.updateMask
        );
        if (snapshot) {
          expectedPostState = snapshot;
          expectedStateSource = "server_symbolic_apply";
        }
      }
    }
  }

  return assertGovernedDryRunResult(
    {
      wouldSucceed: validationErrors.length === 0,
      validationErrors,
      validationSource,
      expectedStateSource,
      ...(expectedPostState ? { expectedPostState } : {}),
    },
    "gads_update_entity"
  );
}
