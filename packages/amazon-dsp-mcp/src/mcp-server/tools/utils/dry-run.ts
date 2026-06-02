// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Dry-run helpers for the Amazon DSP `update_entity` tool. R2-U4 wiring.
 *
 * Amazon DSP exposes NO native validate / preview / draft mode for entity
 * mutations — `/dsp/orders` and `/dsp/lineItems` are plain PUT endpoints, and
 * `/dsp/creatives/{id}/preview` is a creative-render preview, not a mutation
 * simulator. So both axes here are SYMBOLIC:
 *
 * - **Validation** runs a small set of business rules (status enum, budget
 *   non-negativity) against the requested patch. `validationSource: "symbolic"`.
 * - **Expected post-state** reads the current entity through the read partner
 *   and shallow-merges the patch (Amazon DSP PUT replaces provided fields),
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
  buildAmazonDspSnapshot,
  ENTITY_KIND_MAP,
  type AmazonDspServiceLike,
} from "./capture-snapshot.js";

export type { AmazonDspServiceLike };

const VALID_STATES = ["ENABLED", "PAUSED", "ARCHIVED"];

/** Symbolic validation of the requested patch. Pure (no I/O). */
function symbolicValidate(data: Record<string, unknown>): DryRunValidationError[] {
  const errors: DryRunValidationError[] = [];

  if ("state" in data) {
    const state = data.state;
    if (typeof state !== "string" || !VALID_STATES.includes(state)) {
      errors.push({
        code: "INVALID_STATE",
        message: `state must be one of ${VALID_STATES.join(", ")} — got ${String(state)}`,
        field: "data.state",
      });
    }
  }

  if ("budget" in data && data.budget != null) {
    // `order` budget is a flat number; `lineItem` budget is { budgetType, budget }.
    const raw =
      typeof data.budget === "object"
        ? (data.budget as Record<string, unknown>).budget
        : data.budget;
    const n = typeof raw === "string" ? Number(raw) : Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      errors.push({
        code: "INVALID_BUDGET",
        message: "budget must be a non-negative number (advertiser currency major units)",
        field: "data.budget",
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
export function applyAmazonDspPatch(
  entityType: string,
  entityId: string,
  preState: Record<string, unknown>,
  data: Record<string, unknown>
): NormalizedEntitySnapshot | undefined {
  const snapshot = buildAmazonDspSnapshot(entityType, entityId, preState, data);
  return snapshot ?? undefined;
}

/**
 * Resolve the concrete `(operation, entityKind)` an `amazon_dsp_update_entity`
 * call dispatches to, from its `data` payload. The tool is a multi-operation
 * dispatcher; governance requires every response to name the capability the
 * call exercised. Pure (no I/O).
 */
export function resolveAmazonDspDispatchedCapability(
  entityType: string,
  data: Record<string, unknown>
): DispatchedCapability {
  const state = typeof data.state === "string" ? data.state : undefined;
  let operation: string;
  if (state === "ENABLED") {
    operation = "resume";
  } else if (state === "PAUSED") {
    operation = "pause";
  } else if (state) {
    // ARCHIVED and any other state transition.
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

export interface AmazonDspDryRunArgs {
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
}

export async function runAmazonDspUpdateDryRun(
  input: AmazonDspDryRunArgs,
  service: AmazonDspServiceLike,
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
      const snapshot = buildAmazonDspSnapshot(
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
    "amazon_dsp_update_entity"
  );
}

/**
 * Resolve the `(duplicate, entityKind)` for an `amazon_dsp_duplicate_entity`
 * call. Out-of-scope types (creative / target / creativeAssociation) resolve to
 * `canonicalEntityKind: null` — token-gated, no canonical snapshot. Pure.
 */
export function resolveAmazonDspDuplicateCapability(entityType: string): DispatchedCapability {
  return {
    operation: "duplicate",
    canonicalEntityKind: ENTITY_KIND_MAP[entityType] ?? null,
  };
}

export interface AmazonDspDuplicateDryRunArgs {
  entityType: string;
  /** ID of the SOURCE entity being duplicated. */
  entityId: string;
  /** Copy overrides forwarded to the create call (may rename or re-state the copy). */
  options?: Record<string, unknown>;
}

/**
 * Symbolic dry-run for `amazon_dsp_duplicate_entity`. The copy does not exist
 * yet (no `before`). The service builds the copy as `{ ...source, state:
 * "PAUSED", ...options }` — so the expected post-state reads the source, forces
 * the non-running `state: "PAUSED"`, then applies the caller's `options` last
 * (matching execute: options may rename or override the state), and emits it
 * with an empty `platformEntityId`. Out-of-scope kinds are token-gated but not
 * snapshot-governed.
 */
export async function runAmazonDspDuplicateDryRun(
  args: AmazonDspDuplicateDryRunArgs,
  service: AmazonDspServiceLike,
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
      const snapshot = buildAmazonDspSnapshot(args.entityType, "", source, {
        state: "PAUSED",
        ...(args.options ?? {}),
      });
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
  return inScope ? assertGovernedDryRunResult(result, "amazon_dsp_duplicate_entity") : result;
}
