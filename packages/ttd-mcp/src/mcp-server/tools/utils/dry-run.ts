// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Dry-run helpers for the TTD `update_entity` tool. R3-U2 wiring.
 *
 * TTD exposes NO native validate / preview / draft mode for entity mutations —
 * `/v3/campaign` and `/v3/adgroup` are plain PUT endpoints, and a successful
 * PUT applies the change. So both axes here are SYMBOLIC:
 *
 * - **Validation** runs a small set of business rules (Availability enum,
 *   budget non-negativity) against the requested patch.
 *   `validationSource: "symbolic"`.
 * - **Expected post-state** reads the current entity through the read partner
 *   and shallow-merges the patch (TTD PUT replaces provided fields), then
 *   normalizes. `expectedStateSource: "server_symbolic_apply"`.
 */

import { assertGovernedDryRunResult } from "@cesteral/shared";
import type {
  DispatchedCapability,
  DryRunResult,
  DryRunValidationError,
  NormalizedEntitySnapshot,
  RequestContext,
} from "@cesteral/shared";
import { buildTtdSnapshot, ENTITY_KIND_MAP, type TtdServiceLike } from "./capture-snapshot.js";

export type { TtdServiceLike };

const VALID_AVAILABILITY = ["Available", "Paused", "Archived"];

/** Symbolic validation of the requested patch. Pure (no I/O). */
function symbolicValidate(data: Record<string, unknown>): DryRunValidationError[] {
  const errors: DryRunValidationError[] = [];

  if ("Availability" in data) {
    const availability = data.Availability;
    if (typeof availability !== "string" || !VALID_AVAILABILITY.includes(availability)) {
      errors.push({
        code: "INVALID_AVAILABILITY",
        message: `Availability must be one of ${VALID_AVAILABILITY.join(", ")} — got ${String(availability)}`,
        field: "data.Availability",
      });
    }
  }

  for (const field of ["Budget", "DailyBudget"] as const) {
    if (field in data && data[field] != null) {
      const raw = data[field];
      const amount = raw && typeof raw === "object" ? (raw as Record<string, unknown>).Amount : raw;
      const n = typeof amount === "string" ? Number(amount) : Number(amount);
      if (!Number.isFinite(n) || n < 0) {
        errors.push({
          code: "INVALID_BUDGET",
          message: `${field}.Amount must be a non-negative number (advertiser currency major units)`,
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
export function applyTtdPatch(
  entityType: string,
  entityId: string,
  preState: Record<string, unknown>,
  data: Record<string, unknown>
): NormalizedEntitySnapshot | undefined {
  const snapshot = buildTtdSnapshot(entityType, entityId, preState, data);
  return snapshot ?? undefined;
}

/**
 * Resolve the concrete `(operation, entityKind)` a `ttd_update_entity` call
 * dispatches to, from its `data` payload. The tool is a multi-operation
 * dispatcher; governance requires every response to name the capability the
 * call exercised. Pure (no I/O).
 */
export function resolveTtdDispatchedCapability(
  entityType: string,
  data: Record<string, unknown>
): DispatchedCapability {
  const availability = typeof data.Availability === "string" ? data.Availability : undefined;
  let operation: string;
  if (availability === "Paused") {
    operation = "pause";
  } else if (availability === "Available") {
    operation = "resume";
  } else if (availability) {
    // Archived and any other status transition.
    operation = "update_status";
  } else if ("Budget" in data || "DailyBudget" in data) {
    operation = "update_budget";
  } else {
    operation = "update";
  }
  return {
    operation,
    canonicalEntityKind: ENTITY_KIND_MAP[entityType] ?? entityType ?? "unknown",
  };
}

/**
 * Resolve the `(create, entityKind)` capability for `ttd_create_entity`.
 * Out-of-scope kinds (advertiser / creative / conversionTracker) resolve to
 * `canonicalEntityKind: null` — the call is still token-gated but emits no
 * snapshot. Pure (no I/O).
 */
export function resolveTtdCreateCapability(entityType: string): DispatchedCapability {
  return {
    operation: "create",
    canonicalEntityKind: ENTITY_KIND_MAP[entityType] ?? null,
  };
}

export interface TtdCreateDryRunArgs {
  entityType: string;
  /** The merged create payload (parent IDs already folded into the entity data). */
  data: Record<string, unknown>;
}

/**
 * Symbolic create dry-run. TTD exposes no native validate mode for the create
 * endpoints, so both axes are symbolic: validation runs the same business
 * rules as update; the expected post-state is the would-be-created entity
 * (symbolic apply of the create payload over an empty base — create has no
 * `before`). Pure (no I/O).
 */
export async function runTtdCreateDryRun(
  input: TtdCreateDryRunArgs,
  _service: TtdServiceLike,
  _context: RequestContext
): Promise<DryRunResult> {
  const validationErrors = symbolicValidate(input.data);

  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";
  if (ENTITY_KIND_MAP[input.entityType]) {
    const snapshot = buildTtdSnapshot(input.entityType, "", {}, input.data);
    if (snapshot) {
      expectedPostState = snapshot;
      expectedStateSource = "server_symbolic_apply";
    }
  }

  // Out-of-scope kinds are token-gated but NOT snapshot-governed (plan
  // §Template A): they legitimately resolve canonicalEntityKind: null and emit
  // no canonical snapshot — on dry-run as well as execute. The in-scope
  // simulation guard (`assertGovernedDryRunResult`) must therefore be skipped
  // for them; applying it would fail an honest no-snapshot result.
  const inScope = Boolean(ENTITY_KIND_MAP[input.entityType]);
  const result: DryRunResult = {
    wouldSucceed: validationErrors.length === 0 && (!inScope || expectedPostState !== undefined),
    validationErrors,
    validationSource: "symbolic",
    expectedStateSource,
    ...(expectedPostState ? { expectedPostState } : {}),
  };
  return inScope ? assertGovernedDryRunResult(result, "ttd_create_entity") : result;
}

export interface TtdDryRunArgs {
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
}

export async function runTtdUpdateDryRun(
  input: TtdDryRunArgs,
  service: TtdServiceLike,
  context: RequestContext
): Promise<DryRunResult> {
  const validationErrors = symbolicValidate(input.data);

  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";

  // A read failure propagates: a governed dry-run that cannot simulate must
  // fail the call (see assertGovernedDryRunResult below), not swallow the
  // error and return an incomplete payload the governance layer would reject.
  if (ENTITY_KIND_MAP[input.entityType] && service.getEntity) {
    const current = (await service.getEntity(input.entityType, input.entityId, context)) as
      | Record<string, unknown>
      | undefined;
    if (current && typeof current === "object") {
      const snapshot = buildTtdSnapshot(input.entityType, input.entityId, current, input.data);
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
    "ttd_update_entity"
  );
}
