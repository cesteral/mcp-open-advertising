// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Dry-run helpers for the TikTok `update_entity` tool. R3-U4 wiring.
 *
 * TikTok exposes NO native validate / preview / draft mode for entity
 * mutations — `/campaign/update/`, `/adgroup/update/` and `/ad/update/` are
 * plain POST endpoints. So both axes here are SYMBOLIC:
 *
 * - **Validation** runs a small set of business rules (operation_status enum,
 *   budget non-negativity, budget_mode enum) against the requested patch.
 *   `validationSource: "symbolic"`.
 * - **Expected post-state** reads the current entity through the read partner
 *   and shallow-merges the patch (TikTok POST overlays provided fields), then
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
import {
  buildTiktokSnapshot,
  ENTITY_KIND_MAP,
  type TiktokServiceLike,
} from "./capture-snapshot.js";

export type { TiktokServiceLike };

const VALID_OPERATION_STATUS = ["ENABLE", "DISABLE", "DELETE"];
const VALID_BUDGET_MODE = ["BUDGET_MODE_DAY", "BUDGET_MODE_TOTAL", "BUDGET_MODE_INFINITE"];

/** Symbolic validation of the requested patch. Pure (no I/O). */
function symbolicValidate(data: Record<string, unknown>): DryRunValidationError[] {
  const errors: DryRunValidationError[] = [];

  if ("operation_status" in data) {
    const status = data.operation_status;
    if (typeof status !== "string" || !VALID_OPERATION_STATUS.includes(status)) {
      errors.push({
        code: "INVALID_OPERATION_STATUS",
        message: `operation_status must be one of ${VALID_OPERATION_STATUS.join(", ")} — got ${String(status)}`,
        field: "data.operation_status",
      });
    }
  }

  if ("budget" in data && data.budget != null) {
    const n = typeof data.budget === "string" ? Number(data.budget) : Number(data.budget);
    if (!Number.isFinite(n) || n < 0) {
      errors.push({
        code: "INVALID_BUDGET",
        message: "budget must be a non-negative number (advertiser currency major units)",
        field: "data.budget",
      });
    }
  }

  if ("budget_mode" in data && data.budget_mode != null) {
    const mode = data.budget_mode;
    if (typeof mode !== "string" || !VALID_BUDGET_MODE.includes(mode)) {
      errors.push({
        code: "INVALID_BUDGET_MODE",
        message: `budget_mode must be one of ${VALID_BUDGET_MODE.join(", ")} — got ${String(mode)}`,
        field: "data.budget_mode",
      });
    }
  }

  return errors;
}

/**
 * Symbolic apply: shallow-merge `data` into `preState`, then normalize. Pure
 * (no I/O). Used by the testkit's `assertContract` against fixture pairs and
 * mirrors what the dry-run handler does in-tool.
 */
export function applyTiktokPatch(
  entityType: string,
  entityId: string,
  preState: Record<string, unknown>,
  data: Record<string, unknown>
): NormalizedEntitySnapshot | undefined {
  const snapshot = buildTiktokSnapshot(entityType, entityId, preState, data);
  return snapshot ?? undefined;
}

/**
 * Resolve the concrete `(operation, entityKind)` a `tiktok_update_entity`
 * call dispatches to, from its `data` payload. The tool is a multi-operation
 * dispatcher; governance requires every response to name the capability the
 * call exercised. Pure (no I/O).
 */
export function resolveTiktokDispatchedCapability(
  entityType: string,
  data: Record<string, unknown>
): DispatchedCapability {
  const operationStatus = data.operation_status;
  let operation: string;
  if (operationStatus === "DISABLE") {
    operation = "pause";
  } else if (operationStatus === "ENABLE") {
    operation = "resume";
  } else if (operationStatus) {
    // DELETE and any other operation_status value.
    operation = "update_status";
  } else if ("budget" in data) {
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
 * Resolve the `(operation, entityKind)` for a `tiktok_create_entity` call.
 * Out-of-scope types resolve to `canonicalEntityKind: null`. Pure.
 */
export function resolveTiktokCreateCapability(entityType: string): DispatchedCapability {
  return {
    operation: "create",
    canonicalEntityKind: ENTITY_KIND_MAP[entityType] ?? null,
  };
}

export interface TiktokCreateDryRunArgs {
  entityType: string;
  data: Record<string, unknown>;
}

/**
 * Symbolic dry-run for `tiktok_create_entity`. No pre-state; expected post-state
 * is the would-be-created entity (the `data` payload normalized, empty
 * pre-state). `platformEntityId` is empty — assigned by the server on execute.
 */
export async function runTiktokCreateDryRun(
  args: TiktokCreateDryRunArgs,
  _service: unknown,
  _context: RequestContext
): Promise<DryRunResult> {
  const validationErrors = symbolicValidate(args.data);
  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";
  if (ENTITY_KIND_MAP[args.entityType]) {
    const snapshot = buildTiktokSnapshot(args.entityType, "", {}, args.data);
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
  const inScope = Boolean(ENTITY_KIND_MAP[args.entityType]);
  const result: DryRunResult = {
    wouldSucceed: validationErrors.length === 0 && (!inScope || expectedPostState !== undefined),
    validationErrors,
    validationSource: "symbolic",
    expectedStateSource,
    ...(expectedPostState ? { expectedPostState } : {}),
  };
  return inScope ? assertGovernedDryRunResult(result, "tiktok_create_entity") : result;
}

export interface TiktokDryRunArgs {
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
}

export async function runTiktokUpdateDryRun(
  input: TiktokDryRunArgs,
  service: TiktokServiceLike,
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
      const snapshot = buildTiktokSnapshot(input.entityType, input.entityId, current, input.data);
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
    "tiktok_update_entity"
  );
}
