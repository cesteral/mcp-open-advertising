// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Dry-run helpers for the CM360 `cm360_update_entity` tool. R4-U2 wiring.
 *
 * CM360 exposes NO native validate / preview / draft mode for entity
 * mutations — the dfareporting `*.update` endpoints are plain PUT replacements
 * with no simulator. So both axes here are SYMBOLIC:
 *
 * - **Validation** runs a small set of business rules (status-boolean type
 *   checks, the `active`/`archived` mutual-exclusion CM360 enforces) against
 *   the requested patch. `validationSource: "symbolic"`.
 * - **Expected post-state** reads the current entity through the read partner
 *   and shallow-merges the patch (CM360 PUT replaces the whole object), then
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
import { buildCm360Snapshot, ENTITY_KIND_MAP, type Cm360ServiceLike } from "./capture-snapshot.js";

export type { Cm360ServiceLike };

/** Symbolic validation of the requested patch. Pure (no I/O). */
function symbolicValidate(data: Record<string, unknown>): DryRunValidationError[] {
  const errors: DryRunValidationError[] = [];

  if ("archived" in data && data.archived != null && typeof data.archived !== "boolean") {
    errors.push({
      code: "INVALID_STATUS",
      message: `archived must be a boolean — got ${typeof data.archived}`,
      field: "data.archived",
    });
  }

  if ("active" in data && data.active != null && typeof data.active !== "boolean") {
    errors.push({
      code: "INVALID_STATUS",
      message: `active must be a boolean — got ${typeof data.active}`,
      field: "data.active",
    });
  }

  // CM360 rejects an ad/creative that is simultaneously active and archived.
  if (data.active === true && data.archived === true) {
    errors.push({
      code: "INVALID_STATUS",
      message: "active and archived cannot both be true — CM360 rejects this combination",
      field: "data.archived",
    });
  }

  return errors;
}

/**
 * Symbolic apply: shallow-merge `data` into `preState`, then normalize. Pure
 * (no I/O). Used by the testkit's `assertContract` against fixture pairs and
 * mirrors what the dry-run handler does in-tool.
 */
export function applyCm360Patch(
  entityType: string,
  entityId: string,
  preState: Record<string, unknown>,
  data: Record<string, unknown>
): NormalizedEntitySnapshot | undefined {
  const snapshot = buildCm360Snapshot(entityType, entityId, preState, data);
  return snapshot ?? undefined;
}

/**
 * Resolve the concrete `(operation, entityKind)` a `cm360_update_entity` call
 * dispatches to, from its `data` payload. The tool is a multi-operation
 * dispatcher; governance requires every response to name the capability the
 * call exercised. Pure (no I/O).
 *
 * - An `active` field set to `false` → `pause`; set to `true` → `resume`.
 * - Any other status change (an `archived` flip — CM360 has no platform-native
 *   paused state for campaigns) → `update_status`.
 * - A budget field present → `update_budget` (CM360 carries no budget on these
 *   entities, so this branch is effectively unreachable but kept for parity
 *   with the governed-write contract).
 * - Otherwise → `update`.
 */
export function resolveCm360DispatchedCapability(
  entityType: string,
  data: Record<string, unknown>
): DispatchedCapability {
  let operation: string;
  if (data.active === false) {
    operation = "pause";
  } else if (data.active === true) {
    operation = "resume";
  } else if ("archived" in data || "active" in data) {
    // An archived flip, or any other status-field change.
    operation = "update_status";
  } else if ("budget" in data) {
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
 * Resolve the `(create, entityKind)` capability for `cm360_create_entity`.
 * Out-of-scope kinds (floodlightActivity, creative, …) resolve to
 * `canonicalEntityKind: null` — the call is still token-gated but emits no
 * snapshot. Pure (no I/O).
 */
export function resolveCm360CreateCapability(entityType: string): DispatchedCapability {
  return {
    operation: "create",
    canonicalEntityKind: ENTITY_KIND_MAP[entityType] ?? null,
  };
}

export interface Cm360CreateDryRunArgs {
  entityType: string;
  data: Record<string, unknown>;
}

/**
 * Symbolic create dry-run. CM360 exposes no native validate mode for the
 * `*.insert` endpoints, so both axes are symbolic: validation runs the same
 * status-boolean business rules as update; the expected post-state is the
 * would-be-created entity (symbolic apply of the create payload over an empty
 * base — create has no `before`). Pure (no I/O).
 */
export async function runCm360CreateDryRun(
  input: Cm360CreateDryRunArgs,
  _service: Cm360ServiceLike,
  _context: RequestContext
): Promise<DryRunResult> {
  const validationErrors = symbolicValidate(input.data);

  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";
  if (ENTITY_KIND_MAP[input.entityType]) {
    const snapshot = buildCm360Snapshot(input.entityType, "", {}, input.data);
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
  return inScope ? assertGovernedDryRunResult(result, "cm360_create_entity") : result;
}

export interface Cm360DryRunArgs {
  entityType: string;
  profileId: string;
  entityId: string;
  data: Record<string, unknown>;
}

export async function runCm360UpdateDryRun(
  input: Cm360DryRunArgs,
  service: Cm360ServiceLike,
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
      input.profileId,
      input.entityId,
      context
    )) as Record<string, unknown> | undefined;
    if (current && typeof current === "object") {
      const snapshot = buildCm360Snapshot(input.entityType, input.entityId, current, input.data);
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
    "cm360_update_entity"
  );
}
