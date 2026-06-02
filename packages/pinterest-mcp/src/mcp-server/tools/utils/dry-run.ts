// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Dry-run helpers for the Pinterest `update_entity` tool. R4-U4 wiring.
 *
 * Pinterest exposes NO native validate / preview / draft mode for entity
 * mutations — campaign / ad-group / ad updates are plain PATCH endpoints, and
 * `/v5/ad_accounts/{id}/ads/previews` (`getAdPreviews`) is a creative-render
 * preview, not a mutation simulator. So both axes here are SYMBOLIC:
 *
 * - **Validation** runs a small set of business rules (status enum, budget
 *   non-negativity) against the requested patch. `validationSource: "symbolic"`.
 * - **Expected post-state** reads the current entity through the read partner
 *   and shallow-merges the patch (Pinterest PATCH overlays provided fields),
 *   then normalizes. `expectedStateSource: "server_symbolic_apply"`.
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
  buildPinterestSnapshot,
  ENTITY_KIND_MAP,
  type PinterestServiceLike,
} from "./capture-snapshot.js";

export type { PinterestServiceLike };

const VALID_STATUSES = ["ACTIVE", "PAUSED", "ARCHIVED", "DRAFT", "DELETED_DRAFT"];

/** Budget field names that carry a micro-currency amount, by entity kind. */
const BUDGET_FIELDS = [
  "daily_spend_cap",
  "lifetime_spend_cap",
  "budget_in_micro_currency",
] as const;

/** Symbolic validation of the requested patch. Pure (no I/O). */
function symbolicValidate(data: Record<string, unknown>): DryRunValidationError[] {
  const errors: DryRunValidationError[] = [];

  if ("status" in data) {
    const status = data.status;
    if (typeof status !== "string" || !VALID_STATUSES.includes(status)) {
      errors.push({
        code: "INVALID_STATUS",
        message: `status must be one of ${VALID_STATUSES.join(", ")} — got ${String(status)}`,
        field: "data.status",
      });
    }
  }

  for (const field of BUDGET_FIELDS) {
    if (field in data && data[field] != null) {
      const raw = data[field];
      const n = typeof raw === "string" ? Number(raw) : Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        errors.push({
          code: "INVALID_BUDGET",
          message: `${field} must be a non-negative number (micro-currency)`,
          field: `data.${field}`,
        });
      }
    }
  }

  return errors;
}

/**
 * Symbolic apply: shallow-merge `data` into `preState`, then normalize. Pure
 * (no I/O). Used by the testkit's `assertContract` against fixture pairs and
 * mirrors what the dry-run handler does in-tool.
 */
export function applyPinterestPatch(
  entityType: string,
  entityId: string,
  preState: Record<string, unknown>,
  data: Record<string, unknown>
): NormalizedEntitySnapshot | undefined {
  const snapshot = buildPinterestSnapshot(entityType, entityId, preState, data);
  return snapshot ?? undefined;
}

/**
 * Resolve the concrete `(operation, entityKind)` a `pinterest_update_entity`
 * call dispatches to, from its `data` payload. The tool is a multi-operation
 * dispatcher; governance requires every response to name the capability the
 * call exercised. Pure (no I/O).
 */
export function resolvePinterestDispatchedCapability(
  entityType: string,
  data: Record<string, unknown>
): DispatchedCapability {
  const status = typeof data.status === "string" ? data.status : undefined;
  let operation: string;
  if (status === "ACTIVE") {
    operation = "resume";
  } else if (status === "PAUSED") {
    operation = "pause";
  } else if (status) {
    // ARCHIVED, DRAFT, DELETED_DRAFT and any other status transition.
    operation = "update_status";
  } else if (BUDGET_FIELDS.some((field) => field in data)) {
    operation = "update_budget";
  } else {
    operation = "update";
  }
  return {
    operation,
    canonicalEntityKind: ENTITY_KIND_MAP[entityType] || entityType || "unknown",
  };
}

export interface PinterestDryRunArgs {
  entityType: string;
  adAccountId: string;
  entityId: string;
  data: Record<string, unknown>;
}

export async function runPinterestUpdateDryRun(
  input: PinterestDryRunArgs,
  service: PinterestServiceLike,
  context: RequestContext
): Promise<DryRunResult> {
  const validationErrors = symbolicValidate(input.data);

  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";

  // A read failure propagates: a governed dry-run that cannot simulate must
  // fail the call (see assertGovernedDryRunResult below), not swallow the
  // error and return an incomplete payload the governance layer would reject.
  if (ENTITY_KIND_MAP[input.entityType] && service.getEntity) {
    const current = (await service.getEntity(
      input.entityType,
      { adAccountId: input.adAccountId },
      input.entityId,
      context
    )) as Record<string, unknown> | undefined;
    if (current && typeof current === "object") {
      const snapshot = buildPinterestSnapshot(
        input.entityType,
        input.entityId,
        current,
        input.data
      );
      if (snapshot) {
        expectedPostState = snapshot;
        expectedStateSource = "server_symbolic_apply";
      }
    }
  }

  return assertGovernedDryRunResult(
    {
      wouldSucceed: validationErrors.length === 0,
      validationErrors,
      validationSource: "symbolic",
      expectedStateSource,
      ...(expectedPostState ? { expectedPostState } : {}),
    },
    "pinterest_update_entity"
  );
}

/**
 * Resolve the `(duplicate, entityKind)` for a `pinterest_duplicate_entity`
 * call. Out-of-scope types resolve to `canonicalEntityKind: null` —
 * token-gated, no canonical snapshot. Pure.
 */
export function resolvePinterestDuplicateCapability(entityType: string): DispatchedCapability {
  return {
    operation: "duplicate",
    canonicalEntityKind: ENTITY_KIND_MAP[entityType] ?? null,
  };
}

export interface PinterestDuplicateDryRunArgs {
  entityType: string;
  adAccountId: string;
  /** ID of the SOURCE entity being duplicated. */
  entityId: string;
  /** Copy overrides forwarded to the create call (may rename or re-state the copy). */
  options?: Record<string, unknown>;
}

/**
 * Symbolic dry-run for `pinterest_duplicate_entity`. The copy does not exist
 * yet (no `before`). Pinterest has no native copy API — the service re-creates
 * the entity as `{ ...source(minus system fields), ...options }`, so the copy
 * KEEPS the source status unless the caller overrides it via `options` (there
 * is no forced pause). The expected post-state reads the source, applies the
 * caller's `options` overlay, and emits it with an empty `platformEntityId`.
 * Out-of-scope kinds are token-gated but not snapshot-governed.
 */
export async function runPinterestDuplicateDryRun(
  args: PinterestDuplicateDryRunArgs,
  service: PinterestServiceLike,
  context: RequestContext
): Promise<DryRunResult> {
  const validationErrors: DryRunValidationError[] = [];
  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";

  const inScope = Boolean(ENTITY_KIND_MAP[args.entityType]);
  if (inScope && service.getEntity) {
    const source = (await service.getEntity(
      args.entityType,
      { adAccountId: args.adAccountId },
      args.entityId,
      context
    )) as Record<string, unknown> | undefined;
    if (source && typeof source === "object") {
      const snapshot = buildPinterestSnapshot(args.entityType, "", source, args.options ?? {});
      if (snapshot) {
        expectedPostState = snapshot;
        expectedStateSource = "server_symbolic_apply";
      }
    }
  }

  // Out-of-scope kinds are token-gated but NOT snapshot-governed (plan
  // §Template A): skip the in-scope simulation guard for them.
  const result: DryRunResult = {
    wouldSucceed: validationErrors.length === 0 && (!inScope || expectedPostState !== undefined),
    validationErrors,
    validationSource: "symbolic",
    expectedStateSource,
    ...(expectedPostState ? { expectedPostState } : {}),
  };
  return inScope ? assertGovernedDryRunResult(result, "pinterest_duplicate_entity") : result;
}
