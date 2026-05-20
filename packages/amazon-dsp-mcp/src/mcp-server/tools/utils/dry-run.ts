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

import type {
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

  if (ENTITY_KIND_MAP[input.entityType] && service.getEntity) {
    try {
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
    } catch {
      // Symbolic apply is best-effort; if the read fails we leave
      // expectedStateSource "none". The validation result still stands.
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
