// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Dry-run helpers for the Snapchat `update_entity` tool. R4-U3 wiring.
 *
 * Snapchat exposes NO native validate / preview / draft mode for entity
 * mutations — campaigns, ad squads, and ads are written via a collection-level
 * PUT, and there is no simulate endpoint. So both axes here are SYMBOLIC:
 *
 * - **Validation** runs a small set of business rules (status enum, budget
 *   non-negativity) against the requested patch. `validationSource: "symbolic"`.
 * - **Expected post-state** reads the current entity through the read partner
 *   and shallow-merges the patch (Snapchat's update merges the patch over the
 *   current entity), then normalizes. `expectedStateSource:
 *   "server_symbolic_apply"`.
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
  buildSnapchatSnapshot,
  ENTITY_KIND_MAP,
  type SnapchatServiceLike,
} from "./capture-snapshot.js";

export type { SnapchatServiceLike };

const VALID_STATUSES = ["ACTIVE", "PAUSED"];
const PAUSED_STATUSES = ["PAUSED"];
const ACTIVE_STATUSES = ["ACTIVE"];
const BUDGET_FIELDS = ["daily_budget_micro", "lifetime_budget_micro"];

/** Symbolic validation of the requested patch. Pure (no I/O). */
export function symbolicValidate(data: Record<string, unknown>): DryRunValidationError[] {
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
export function applySnapchatPatch(
  entityType: string,
  entityId: string,
  preState: Record<string, unknown>,
  data: Record<string, unknown>
): NormalizedEntitySnapshot | undefined {
  const snapshot = buildSnapchatSnapshot(entityType, entityId, preState, data);
  return snapshot ?? undefined;
}

/**
 * Resolve the concrete `(operation, entityKind)` a `snapchat_update_entity`
 * call dispatches to, from its `data` payload. The tool is a multi-operation
 * dispatcher; governance requires every response to name the capability the
 * call exercised. Pure (no I/O).
 */
export function resolveSnapchatDispatchedCapability(
  entityType: string,
  data: Record<string, unknown>
): DispatchedCapability {
  const status = typeof data.status === "string" ? data.status : undefined;
  const hasBudget = BUDGET_FIELDS.some((f) => f in data);
  let operation: string;
  if (status && PAUSED_STATUSES.includes(status)) {
    operation = "pause";
  } else if (status && ACTIVE_STATUSES.includes(status)) {
    operation = "resume";
  } else if (status) {
    // Any other status transition.
    operation = "update_status";
  } else if (hasBudget) {
    operation = "update_budget";
  } else {
    operation = "update";
  }
  return {
    operation,
    canonicalEntityKind: ENTITY_KIND_MAP[entityType] ?? entityType ?? "unknown",
  };
}

/** Resolve `(operation, entityKind)` for a `snapchat_create_entity` call. Pure. */
export function resolveSnapchatCreateCapability(entityType: string): DispatchedCapability {
  return {
    operation: "create",
    canonicalEntityKind: ENTITY_KIND_MAP[entityType] ?? null,
  };
}

export function resolveSnapchatDuplicateCapability(entityType: string): DispatchedCapability {
  return {
    operation: "duplicate",
    canonicalEntityKind: ENTITY_KIND_MAP[entityType] ?? null,
  };
}

export interface SnapchatDuplicateDryRunArgs {
  entityType: string;
  entityId: string;
  options?: Record<string, unknown>;
}

/**
 * Symbolic dry-run for `snapchat_duplicate_entity`. Reads the source entity and
 * projects the would-be copy (source fields with any `options` overlaid, empty
 * new ID) as the expected post-state. Duplicate has no `before`. A read failure
 * on an in-scope kind fails the governed call via `assertGovernedDryRunResult`.
 */
export async function runSnapchatDuplicateDryRun(
  args: SnapchatDuplicateDryRunArgs,
  service: SnapchatServiceLike,
  context: RequestContext
): Promise<DryRunResult> {
  const validationErrors: DryRunValidationError[] = [];
  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";

  const inScope = Boolean(ENTITY_KIND_MAP[args.entityType]);
  if (inScope && service.getEntity) {
    const source = (await service.getEntity(args.entityType, args.entityId, context)) as
      | Record<string, unknown>
      | undefined;
    if (source && typeof source === "object") {
      const snapshot = buildSnapchatSnapshot(args.entityType, "", source, args.options ?? {});
      if (snapshot) {
        expectedPostState = snapshot;
        expectedStateSource = "server_symbolic_apply";
      }
    }
  }

  const result: DryRunResult = {
    wouldSucceed: validationErrors.length === 0 && (!inScope || expectedPostState !== undefined),
    validationErrors,
    validationSource: "symbolic",
    expectedStateSource,
    ...(expectedPostState ? { expectedPostState } : {}),
  };
  return inScope ? assertGovernedDryRunResult(result, "snapchat_duplicate_entity") : result;
}

export interface SnapchatCreateDryRunArgs {
  entityType: string;
  data: Record<string, unknown>;
}

/**
 * Symbolic dry-run for `snapchat_create_entity`. No pre-state; the expected
 * post-state is the would-be-created entity (the `data` payload normalized,
 * empty pre-state). `platformEntityId` is empty — assigned by the server.
 */
export async function runSnapchatCreateDryRun(
  args: SnapchatCreateDryRunArgs,
  _service: unknown,
  _context: RequestContext
): Promise<DryRunResult> {
  const validationErrors = symbolicValidate(args.data);
  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";
  if (ENTITY_KIND_MAP[args.entityType]) {
    const snapshot = buildSnapchatSnapshot(args.entityType, "", {}, args.data);
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
  return inScope ? assertGovernedDryRunResult(result, "snapchat_create_entity") : result;
}

export interface SnapchatDryRunArgs {
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
}

export async function runSnapchatUpdateDryRun(
  input: SnapchatDryRunArgs,
  service: SnapchatServiceLike,
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
      const snapshot = buildSnapchatSnapshot(input.entityType, input.entityId, current, input.data);
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
    "snapchat_update_entity"
  );
}
