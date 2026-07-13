// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Dry-run helpers for the Meta `update_entity` tool. PR-C wiring.
 *
 * Meta's Graph API does not expose a generic "validate-only" mutation
 * endpoint that we can invoke without side effects, and the `meta_validate_entity`
 * tool in this package is itself client-side schema validation only. So both
 * axes here are SYMBOLIC for round 1:
 *
 * - **Validation** runs the input Zod schema plus a small set of business
 *   rules against the requested mutation. `validationSource: "symbolic"`.
 * - **Expected post-state** is produced by reading the current entity through
 *   the existing `metaService.getEntity` path and applying the requested
 *   field changes in memory. We only normalize the canonical shape for the
 *   handful of fields round-1 governs (status, daily_budget, lifetime_budget,
 *   name).
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
import { buildMetaSnapshot, ENTITY_KIND_MAP, type MetaServiceLike } from "./capture-snapshot.js";

export type { MetaServiceLike };

export function symbolicValidate(data: Record<string, unknown>): DryRunValidationError[] {
  const errors: DryRunValidationError[] = [];
  if ("status" in data) {
    const status = data.status;
    if (
      typeof status !== "string" ||
      !["ACTIVE", "PAUSED", "ARCHIVED", "DELETED"].includes(status)
    ) {
      errors.push({
        code: "INVALID_STATUS",
        message: `status must be one of ACTIVE, PAUSED, ARCHIVED, DELETED — got ${String(status)}`,
        field: "data.status",
      });
    }
  }
  for (const k of ["daily_budget", "lifetime_budget"] as const) {
    if (k in data) {
      const v = data[k];
      const n = typeof v === "string" ? Number.parseInt(v, 10) : Number(v);
      if (!Number.isFinite(n) || n < 0) {
        errors.push({
          code: "INVALID_BUDGET",
          message: `${k} must be a non-negative integer (cents)`,
          field: `data.${k}`,
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
export function applyMetaPatch(
  entityType: string,
  entityId: string,
  preState: Record<string, unknown>,
  data: Record<string, unknown>
): NormalizedEntitySnapshot | undefined {
  const snapshot = buildMetaSnapshot(entityType, entityId, preState, data);
  return snapshot ?? undefined;
}

/**
 * Resolve the concrete `(operation, entityKind)` a `meta_update_entity` call
 * dispatches to, from its `data` payload. The tool is a multi-operation
 * dispatcher; governance requires every response to name the capability the
 * call exercised. Pure (no I/O).
 */
export function resolveMetaDispatchedCapability(
  entityType: string | undefined,
  data: Record<string, unknown>
): DispatchedCapability {
  const status = typeof data.status === "string" ? data.status : undefined;
  let operation: string;
  if (status === "PAUSED") {
    operation = "pause";
  } else if (status === "ACTIVE") {
    operation = "resume";
  } else if (status) {
    // ARCHIVED / DELETED and any other status transition.
    operation = "update_status";
  } else if ("daily_budget" in data || "lifetime_budget" in data) {
    operation = "update_budget";
  } else {
    operation = "update";
  }
  return {
    operation,
    canonicalEntityKind: (entityType && ENTITY_KIND_MAP[entityType]) || entityType || "unknown",
  };
}

export interface MetaDryRunArgs {
  entityType: string | undefined;
  entityId: string;
  data: Record<string, unknown>;
}

export async function runMetaUpdateDryRun(
  input: MetaDryRunArgs,
  metaService: MetaServiceLike,
  context: RequestContext
): Promise<DryRunResult> {
  const validationErrors = symbolicValidate(input.data);

  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";

  // Expected post-state via symbolic apply over the read partner. A read
  // failure propagates: a governed dry-run that cannot simulate must fail the
  // call (see assertGovernedDryRunResult below), not swallow the error and
  // return an incomplete payload the governance layer would reject.
  if (input.entityType && ENTITY_KIND_MAP[input.entityType] && metaService.getEntity) {
    const current = (await metaService.getEntity(
      input.entityType,
      input.entityId,
      undefined,
      context
    )) as Record<string, unknown> | undefined;
    if (current && typeof current === "object") {
      const snapshot = buildMetaSnapshot(input.entityType, input.entityId, current, input.data);
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
    "meta_update_entity"
  );
}

/**
 * Resolve the `(operation, entityKind)` for a `meta_delete_entity` call. Delete
 * is single-operation; the entity kind comes from the target `entityType`.
 *
 * Out-of-scope types (adCreative, customAudience, …) resolve to
 * `canonicalEntityKind: null` — honest "no canonical entity" rather than a fake
 * kind. Such deletes still execute and are still token-gated under enforce
 * (the tool is `kind:"write"`); they simply carry no canonical snapshot. Pure.
 */
export function resolveMetaDeleteCapability(entityType: string | undefined): DispatchedCapability {
  return {
    operation: "delete",
    canonicalEntityKind: (entityType && ENTITY_KIND_MAP[entityType]) || null,
  };
}

export interface MetaDeleteDryRunArgs {
  entityType: string | undefined;
  entityId: string;
}

/**
 * Symbolic dry-run for `meta_delete_entity`. Validation is symbolic (Meta has
 * no validate-only delete); the expected post-state is the current entity with
 * canonical status `deleted`, produced by reading the entity and overlaying a
 * `DELETED` status. As with update, a governed dry-run that cannot simulate
 * (out-of-scope entity type / read failure) fails the call via
 * `assertGovernedDryRunResult` rather than returning an incomplete payload.
 */
export async function runMetaDeleteDryRun(
  args: MetaDeleteDryRunArgs,
  metaService: MetaServiceLike,
  context: RequestContext
): Promise<DryRunResult> {
  const validationErrors: DryRunValidationError[] = [];
  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";

  if (args.entityType && ENTITY_KIND_MAP[args.entityType] && metaService.getEntity) {
    const current = (await metaService.getEntity(
      args.entityType,
      args.entityId,
      undefined,
      context
    )) as Record<string, unknown> | undefined;
    if (current && typeof current === "object") {
      // Meta rejects deletion of ACTIVE entities (must be paused first). A
      // governed dry-run must not approve a delete the real API will reject.
      if (current.status === "ACTIVE") {
        validationErrors.push({
          code: "ACTIVE_NOT_DELETABLE",
          message: "ACTIVE entities must be paused before deletion",
          field: "entityId",
        });
      }
      const snapshot = buildMetaSnapshot(args.entityType, args.entityId, current, {
        status: "DELETED",
      });
      if (snapshot) {
        expectedPostState = snapshot;
        expectedStateSource = "server_symbolic_apply";
      }
    }
  }

  // Out-of-scope kinds are token-gated but NOT snapshot-governed (plan
  // §Template A): they legitimately resolve canonicalEntityKind: null and emit
  // no canonical snapshot — on dry-run as well as execute. The in-scope
  // simulation guard (`assertGovernedDryRunResult`) must therefore be skipped
  // for them; applying it would fail an honest no-snapshot result.
  const inScope = Boolean(args.entityType && ENTITY_KIND_MAP[args.entityType]);
  const result: DryRunResult = {
    wouldSucceed: validationErrors.length === 0 && (!inScope || expectedPostState !== undefined),
    validationErrors,
    validationSource: "symbolic",
    expectedStateSource,
    ...(expectedPostState ? { expectedPostState } : {}),
  };
  return inScope ? assertGovernedDryRunResult(result, "meta_delete_entity") : result;
}

/**
 * Resolve the `(operation, entityKind)` for a `meta_create_entity` call.
 * Out-of-scope types (adCreative, customAudience) resolve to
 * `canonicalEntityKind: null` — still token-gated under enforce, no canonical
 * snapshot. Pure.
 */
export function resolveMetaCreateCapability(entityType: string | undefined): DispatchedCapability {
  return {
    operation: "create",
    canonicalEntityKind: (entityType && ENTITY_KIND_MAP[entityType]) || null,
  };
}

export interface MetaCreateDryRunArgs {
  entityType: string | undefined;
  data: Record<string, unknown>;
}

/**
 * Symbolic dry-run for `meta_create_entity`. There is no pre-state (the entity
 * does not exist yet), so the expected post-state is the would-be-created
 * entity: the `data` payload normalized via `buildMetaSnapshot` (empty
 * pre-state). `platformEntityId` is empty — the server assigns the real ID on
 * execute. Validation is symbolic (status/budget business rules).
 */
export async function runMetaCreateDryRun(
  args: MetaCreateDryRunArgs,
  _metaService: MetaServiceLike,
  _context: RequestContext
): Promise<DryRunResult> {
  const validationErrors = symbolicValidate(args.data);
  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";

  if (args.entityType && ENTITY_KIND_MAP[args.entityType]) {
    const snapshot = buildMetaSnapshot(args.entityType, "", {}, args.data);
    if (snapshot) {
      expectedPostState = snapshot;
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
    "meta_create_entity"
  );
}

/**
 * Resolve the `(duplicate, entityKind)` for a `meta_duplicate_entity` call.
 * Out-of-scope types resolve to `canonicalEntityKind: null` — token-gated under
 * enforce, no canonical snapshot. Pure.
 */
export function resolveMetaDuplicateCapability(
  entityType: string | undefined
): DispatchedCapability {
  return {
    operation: "duplicate",
    canonicalEntityKind: (entityType && ENTITY_KIND_MAP[entityType]) || null,
  };
}

export interface MetaDuplicateDryRunArgs {
  entityType: string | undefined;
  /** ID of the SOURCE entity being duplicated. */
  entityId: string;
  /** Status the copy lands in. Default (undefined) → PAUSED. */
  statusOption?: "ACTIVE" | "PAUSED" | "INHERITED";
  /** Naming applied to the copy, mirroring `/copies` `rename_options`. */
  renameOptions?: { prefix?: string; suffix?: string };
}

/**
 * Symbolic dry-run for `meta_duplicate_entity`. The copy does not exist yet, so
 * there is no `before` for it. The expected post-state is the SOURCE entity's
 * canonical snapshot re-projected as the copy: read the source, overlay the
 * copy's landing status (Meta copies land PAUSED unless `statusOption` says
 * otherwise; INHERITED keeps the source status), and emit it with an empty
 * `platformEntityId` (the new ID is assigned on execute). Out-of-scope kinds
 * are token-gated but not snapshot-governed.
 */
export async function runMetaDuplicateDryRun(
  args: MetaDuplicateDryRunArgs,
  metaService: MetaServiceLike,
  context: RequestContext
): Promise<DryRunResult> {
  const validationErrors: DryRunValidationError[] = [];
  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";

  const entityType = args.entityType;
  const inScope = Boolean(entityType && ENTITY_KIND_MAP[entityType]);
  if (entityType && inScope && metaService.getEntity) {
    const source = (await metaService.getEntity(entityType, args.entityId, undefined, context)) as
      | Record<string, unknown>
      | undefined;
    if (source && typeof source === "object") {
      // The copy lands PAUSED by default; ACTIVE if requested; INHERITED keeps
      // the source status (no overlay).
      const statusOverlay =
        args.statusOption === "ACTIVE"
          ? { status: "ACTIVE" }
          : args.statusOption === "INHERITED"
            ? {}
            : { status: "PAUSED" };
      // `/copies` `rename_options` wraps the source name with prefix/suffix; the
      // dry-run must predict the copy's display name when the caller renames it.
      const sourceName = typeof source.name === "string" ? source.name : undefined;
      const renamed =
        sourceName != null && (args.renameOptions?.prefix || args.renameOptions?.suffix)
          ? `${args.renameOptions.prefix ?? ""}${sourceName}${args.renameOptions.suffix ?? ""}`
          : undefined;
      const overlay = { ...statusOverlay, ...(renamed != null ? { name: renamed } : {}) };
      const snapshot = buildMetaSnapshot(entityType, "", source, overlay);
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
  return inScope ? assertGovernedDryRunResult(result, "meta_duplicate_entity") : result;
}
