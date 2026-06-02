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

function symbolicValidate(data: Record<string, unknown>): DryRunValidationError[] {
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

  return assertGovernedDryRunResult(
    {
      wouldSucceed: validationErrors.length === 0 && expectedPostState !== undefined,
      validationErrors,
      validationSource: "symbolic",
      expectedStateSource,
      ...(expectedPostState ? { expectedPostState } : {}),
    },
    "meta_delete_entity"
  );
}
