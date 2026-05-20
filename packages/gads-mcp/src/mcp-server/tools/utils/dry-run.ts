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

import type {
  DryRunResult,
  DryRunValidationError,
  NormalizedEntitySnapshot,
  RequestContext,
} from "@cesteral/shared";
import {
  buildGAdsSnapshot,
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
    mode: "create" | "update",
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
  let validationErrors: DryRunValidationError[] = [];
  let validationSource: DryRunResult["validationSource"] = "none";
  if (gadsService.validateEntity) {
    try {
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
    } catch (err) {
      // The validateOnly call itself failed (network / auth / rate limit).
      // Report it honestly rather than fabricating a verdict — leave the
      // source "none" so consumers know validation did not run.
      validationSource = "none";
      validationErrors = [
        {
          code: "VALIDATION_UNAVAILABLE",
          message: err instanceof Error ? err.message : String(err),
        },
      ];
    }
  }

  // ── Expected post-state: symbolic apply over the read-partner snapshot ──
  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";
  if (ENTITY_KIND_MAP[input.entityType] && gadsService.getEntity) {
    try {
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
    } catch {
      // Symbolic apply is best-effort; if the read fails we leave
      // expectedStateSource "none". The native validation result still stands.
    }
  }

  return {
    wouldSucceed: validationErrors.length === 0,
    validationErrors,
    validationSource,
    expectedStateSource,
    ...(expectedPostState ? { expectedPostState } : {}),
  };
}
