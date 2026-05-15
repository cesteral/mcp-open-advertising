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
 *   handful of fields PR-C and round-1 govern (status, daily_budget,
 *   lifetime_budget, name). Anything else returns `expectedStateSource: "none"`.
 */

import type {
  DryRunResult,
  DryRunValidationError,
  NormalizedEntitySnapshot,
  RequestContext,
} from "@cesteral/shared";
import {
  buildMetaSnapshot,
  ENTITY_KIND_MAP,
  type MetaServiceLike,
} from "./capture-snapshot.js";

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

  if (input.entityType && ENTITY_KIND_MAP[input.entityType] && metaService.getEntity) {
    try {
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
    } catch {
      // Symbolic apply is best-effort; if the read fails we leave
      // expectedStateSource: "none". Validation result is still meaningful.
    }
  }

  return {
    wouldSucceed: validationErrors.length === 0,
    validationErrors,
    validationSource: "symbolic",
    expectedStateSource,
    ...(expectedPostState ? { expectedPostState } : {}),
  };
}
