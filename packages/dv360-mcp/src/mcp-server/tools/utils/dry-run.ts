// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Dry-run helpers for the DV360 `update_entity` tool. PR-C wiring.
 *
 * DV360's Display & Video 360 API does not expose a generic validate-only
 * mutation endpoint, and the `dv360_validate_entity` tool in this package is
 * itself client-side schema validation. `get_delivery_estimate` is a query,
 * not a write simulator. So both axes here are SYMBOLIC for round 1:
 *
 * - **Validation** runs the existing `getEntitySchemaForOperation(.., "update")`
 *   Zod schema against the merged patch. `validationSource: "symbolic"`.
 * - **Expected post-state** reads the current entity through `dv360Service.getEntity`
 *   and overlays the patch fields named in `updateMask`, producing a
 *   {@link NormalizedEntitySnapshot} for `lineItem`, `insertionOrder`, and
 *   `campaign`.
 *
 * A governed dry-run must never emit a `"none"` source: when validation or
 * expected-state production cannot complete (read-partner failure, entity
 * outside canonical scope), `assertGovernedDryRunResult` fails the call
 * instead — see `@cesteral/shared`.
 */

import { assertGovernedDryRunResult } from "@cesteral/shared";
import type {
  DispatchedCapability,
  DryRunResult,
  DryRunValidationError,
  NormalizedEntitySnapshot,
  RequestContext,
} from "@cesteral/shared";
import { buildDv360Snapshot, ENTITY_KIND_MAP, type Dv360ServiceLike } from "./capture-snapshot.js";

export type { Dv360ServiceLike };

/**
 * Apply a dotted-path overlay onto a base object. Mutates `out` in place
 * for the path; non-leaf segments are created when missing.
 */
export function setPath(out: Record<string, any>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cursor: Record<string, any> = out;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (cursor[part] == null || typeof cursor[part] !== "object") {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = value;
}

export function getPath(obj: Record<string, any>, path: string): unknown {
  const parts = path.split(".");
  let cursor: any = obj;
  for (const part of parts) {
    cursor = cursor?.[part];
    if (cursor == null) return cursor;
  }
  return cursor;
}

export function deepClone<T>(v: T): T {
  return structuredClone(v);
}

/**
 * Symbolic apply: overlay patch fields named in updateMask onto a clone of
 * `preState`, then normalize. Pure (no I/O). Used by the testkit's
 * `assertContract` against fixture pairs and also by the dry-run handler.
 */
export function applyDv360Patch(
  entityType: string,
  ids: Record<string, string>,
  preState: Record<string, unknown>,
  data: Record<string, unknown>,
  updateMask: string
): NormalizedEntitySnapshot | undefined {
  const applied: Record<string, any> = deepClone(preState);
  const maskFields = updateMask
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  for (const field of maskFields) {
    const v = getPath(data as Record<string, any>, field);
    if (v !== undefined) {
      setPath(applied, field, v);
    }
  }
  const snapshot = buildDv360Snapshot(entityType, ids, preState, applied);
  return snapshot ?? undefined;
}

/**
 * Resolve the concrete `(operation, entityKind)` a `dv360_update_entity` call
 * dispatches to, from its `data` payload. The tool is a multi-operation
 * dispatcher; governance requires every response to name the capability the
 * call exercised. Pure (no I/O).
 */
export function resolveDv360DispatchedCapability(
  entityType: string,
  data: Record<string, unknown>
): DispatchedCapability {
  const status = typeof data.entityStatus === "string" ? data.entityStatus : undefined;
  let operation: string;
  if (status === "ENTITY_STATUS_ACTIVE") {
    operation = "resume";
  } else if (status === "ENTITY_STATUS_PAUSED") {
    operation = "pause";
  } else if (status) {
    // ARCHIVED / DRAFT / SCHEDULED_FOR_DELETION and any other transition.
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
 * Resolve the `(operation, entityKind)` for a `dv360_delete_entity` call.
 * Out-of-scope types (creative, adGroup, advertiser, …) resolve to
 * `canonicalEntityKind: null` — still token-gated under enforce, just no
 * canonical snapshot. Pure.
 */
export function resolveDv360DeleteCapability(entityType: string): DispatchedCapability {
  return {
    operation: "delete",
    canonicalEntityKind: ENTITY_KIND_MAP[entityType] || null,
  };
}

/**
 * Resolve the `(create, entityKind)` for a `dv360_create_entity` call.
 * Out-of-scope types (creative, adGroup, advertiser, …) resolve to
 * `canonicalEntityKind: null` — still token-gated under enforce, just no
 * canonical snapshot. Pure.
 */
export function resolveDv360CreateCapability(entityType: string): DispatchedCapability {
  return {
    operation: "create",
    canonicalEntityKind: ENTITY_KIND_MAP[entityType] || null,
  };
}

export interface Dv360CreateDryRunArgs {
  entityType: string;
  /** Parent IDs resolved from the input (no entity ID — create has none yet). */
  ids: Record<string, string>;
  /** The merged create payload (parent IDs already folded into the data). */
  data: Record<string, unknown>;
}

/**
 * Symbolic dry-run for `dv360_create_entity`. Validation is the injected Zod
 * create-schema validator; the expected post-state is the would-be-created
 * entity (symbolic apply of the create payload over an empty base — create has
 * no `before`). The new entity has no ID pre-create, so `platformEntityId` is
 * the empty-string placeholder (the parent IDs in `ids` only supply
 * `accountId`). Pure (no I/O).
 */
export async function runDv360CreateDryRun(
  args: Dv360CreateDryRunArgs,
  _dv360Service: Dv360ServiceLike,
  _context: RequestContext,
  validateOperation?: (entityType: string, data: Record<string, unknown>) => DryRunValidationError[]
): Promise<DryRunResult> {
  const validationErrors = validateOperation ? validateOperation(args.entityType, args.data) : [];

  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";
  if (ENTITY_KIND_MAP[args.entityType]) {
    const snapshot = buildDv360Snapshot(args.entityType, args.ids, {}, args.data);
    if (snapshot) {
      expectedPostState = { ...snapshot, platformEntityId: "" };
      expectedStateSource = "server_symbolic_apply";
    }
  }

  return assertGovernedDryRunResult(
    {
      wouldSucceed: validationErrors.length === 0 && expectedPostState !== undefined,
      validationErrors,
      validationSource: "symbolic",
      expectedStateSource,
      ...(expectedPostState ? { expectedPostState } : {}),
    },
    "dv360_create_entity"
  );
}

export interface Dv360DeleteDryRunArgs {
  entityType: string;
  ids: Record<string, string>;
}

/**
 * Symbolic dry-run for `dv360_delete_entity`. Validation is symbolic; the
 * expected post-state is the current entity with `ENTITY_STATUS_DELETED`
 * (canonical `deleted`). DV360 rejects deleting a line item that is not
 * archived, so a governed dry-run surfaces that as a validation error rather
 * than approving a delete the real API will reject.
 */
export async function runDv360DeleteDryRun(
  args: Dv360DeleteDryRunArgs,
  dv360Service: Dv360ServiceLike,
  context: RequestContext
): Promise<DryRunResult> {
  const validationErrors: DryRunValidationError[] = [];
  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";

  if (ENTITY_KIND_MAP[args.entityType] && dv360Service.getEntity) {
    const current = (await dv360Service.getEntity(args.entityType, args.ids, context)) as Record<
      string,
      any
    >;
    if (current && typeof current === "object") {
      if (args.entityType === "lineItem" && current.entityStatus !== "ENTITY_STATUS_ARCHIVED") {
        validationErrors.push({
          code: "LINE_ITEM_NOT_ARCHIVED",
          message:
            "Line items must be in ENTITY_STATUS_ARCHIVED before deletion (set via dv360_bulk_update_status)",
          field: "entityStatus",
        });
      }
      const snapshot = buildDv360Snapshot(args.entityType, args.ids, current, {
        ...current,
        entityStatus: "ENTITY_STATUS_DELETED",
      });
      if (snapshot) {
        expectedPostState = snapshot;
        expectedStateSource = "server_symbolic_apply";
      }
    }
  }

  return assertGovernedDryRunResult(
    {
      wouldSucceed: validationErrors.length === 0 && expectedPostState !== undefined,
      validationErrors,
      validationSource: "symbolic",
      expectedStateSource,
      ...(expectedPostState ? { expectedPostState } : {}),
    },
    "dv360_delete_entity"
  );
}

export interface Dv360DryRunArgs {
  entityType: string;
  ids: Record<string, string>;
  data: Record<string, unknown>;
  updateMask: string;
}

export async function runDv360UpdateDryRun(
  input: Dv360DryRunArgs,
  dv360Service: Dv360ServiceLike,
  context: RequestContext,
  // Optional injected validator so callers can pass the Zod schema produced
  // by `getEntitySchemaForOperation`. The tool always supplies it.
  validateOperation?: (
    entityType: string,
    merged: Record<string, unknown>
  ) => DryRunValidationError[]
): Promise<DryRunResult> {
  let validationErrors: DryRunValidationError[] = [];
  let current: Record<string, any> | undefined;

  // A read failure propagates: a governed dry-run that cannot simulate must
  // fail the call (see assertGovernedDryRunResult below), not swallow the
  // error and return an incomplete payload the governance layer would reject.
  if (dv360Service.getEntity) {
    current = (await dv360Service.getEntity(input.entityType, input.ids, context)) as Record<
      string,
      any
    >;
  }

  // Symbolic apply: overlay each field named in updateMask onto a clone of
  // current. If we have no current we still build a partial overlay so the
  // validator sees the shape, but we will not emit a snapshot.
  const applied: Record<string, any> = current ? deepClone(current) : {};
  const maskFields = input.updateMask
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  for (const field of maskFields) {
    const v = getPath(input.data, field);
    if (v !== undefined) {
      setPath(applied, field, v);
    }
  }

  if (validateOperation) {
    validationErrors = validateOperation(input.entityType, applied);
  }

  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";
  if (current) {
    const snapshot = buildDv360Snapshot(input.entityType, input.ids, current, applied);
    if (snapshot) {
      expectedPostState = snapshot;
      expectedStateSource = "server_symbolic_apply";
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
    "dv360_update_entity"
  );
}
