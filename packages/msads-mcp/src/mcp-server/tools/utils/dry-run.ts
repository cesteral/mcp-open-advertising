// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Dry-run helpers for the Microsoft Ads `msads_update_entity` tool. R4-U5 wiring.
 *
 * Microsoft Ads exposes NO native validate / preview / draft mode for entity
 * mutations — the Campaign Management v13 `Update*` operations are plain PUT
 * calls with no `validateOnly` flag wired into this service. So both axes here
 * are SYMBOLIC:
 *
 * - **Validation** runs a small set of business rules (status enum, budget
 *   non-negativity) against the requested patch. `validationSource: "symbolic"`.
 * - **Expected post-state** reads the current entity through the read partner
 *   and shallow-merges the patch (MS Ads PUT replaces provided fields), then
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
import { buildMsAdsSnapshot, ENTITY_KIND_MAP, type MsAdsServiceLike } from "./capture-snapshot.js";

export type { MsAdsServiceLike };

/**
 * Status enum values accepted across the governed entity types. Microsoft Ads
 * uses per-entity status unions (campaign also accepts the budget-throttled
 * states); the dry-run validation is intentionally permissive of the full set
 * so a valid campaign status is not flagged on an ad group.
 */
const VALID_STATUSES = [
  "Active",
  "Paused",
  "BudgetPaused",
  "BudgetAndManualPaused",
  "Suspended",
  "Expired",
  "Deleted",
];

/** Status values that mean "running". */
const ACTIVE_STATUSES = new Set(["Active"]);
/** Status values that mean "stopped but reversible". */
const PAUSED_STATUSES = new Set([
  "Paused",
  "BudgetPaused",
  "BudgetAndManualPaused",
  "Suspended",
  "Expired",
]);

/** Budget-bearing field names on the patch payload. */
const BUDGET_FIELDS = ["Amount", "DailyBudget", "MonthlyBudget"];

/** Symbolic validation of the requested patch. Pure (no I/O). */
function symbolicValidate(data: Record<string, unknown>): DryRunValidationError[] {
  const errors: DryRunValidationError[] = [];

  if ("Status" in data) {
    const status = data.Status;
    if (typeof status !== "string" || !VALID_STATUSES.includes(status)) {
      errors.push({
        code: "INVALID_STATUS",
        message: `Status must be one of ${VALID_STATUSES.join(", ")} — got ${String(status)}`,
        field: "data.Status",
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
          message: `${field} must be a non-negative number (account currency major units)`,
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
export function applyMsAdsPatch(
  entityType: string,
  entityId: string,
  preState: Record<string, unknown>,
  data: Record<string, unknown>
): NormalizedEntitySnapshot | undefined {
  const snapshot = buildMsAdsSnapshot(entityType, entityId, preState, data);
  return snapshot ?? undefined;
}

/**
 * Resolve the concrete `(operation, entityKind)` a `msads_update_entity` call
 * dispatches to, from its `data` payload. The tool is a multi-operation
 * dispatcher; governance requires every response to name the capability the
 * call exercised. Pure (no I/O).
 */
export function resolveMsAdsDispatchedCapability(
  entityType: string,
  data: Record<string, unknown>
): DispatchedCapability {
  const status = typeof data.Status === "string" ? data.Status : undefined;
  let operation: string;
  if (status && ACTIVE_STATUSES.has(status)) {
    operation = "resume";
  } else if (status && PAUSED_STATUSES.has(status)) {
    operation = "pause";
  } else if (status) {
    // Deleted and any other status transition.
    operation = "update_status";
  } else if (BUDGET_FIELDS.some((f) => f in data)) {
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
 * Resolve the `(create, entityKind)` capability for `msads_create_entity`.
 * Out-of-scope kinds (keyword / adExtension / audience / label) resolve to
 * `canonicalEntityKind: null` — the call is still token-gated but emits no
 * snapshot. Pure (no I/O).
 */
export function resolveMsAdsCreateCapability(entityType: string): DispatchedCapability {
  return {
    operation: "create",
    canonicalEntityKind: ENTITY_KIND_MAP[entityType] ?? null,
  };
}

export interface MsAdsCreateDryRunArgs {
  entityType: string;
  /** The single entity item, already unwrapped from its plural collection key. */
  data: Record<string, unknown>;
}

/**
 * Symbolic create dry-run. Microsoft Ads exposes no native validate mode for
 * Add operations, so both axes are symbolic: validation runs the same business
 * rules as update; the expected post-state is the would-be-created entity
 * (symbolic apply of the create payload over an empty base — create has no
 * `before`). Pure (no I/O).
 */
export async function runMsAdsCreateDryRun(
  input: MsAdsCreateDryRunArgs,
  _service: MsAdsServiceLike,
  _context: RequestContext
): Promise<DryRunResult> {
  const validationErrors = symbolicValidate(input.data);

  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";
  if (ENTITY_KIND_MAP[input.entityType]) {
    const snapshot = buildMsAdsSnapshot(input.entityType, "", {}, input.data);
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
  return inScope ? assertGovernedDryRunResult(result, "msads_create_entity") : result;
}

export interface MsAdsDryRunArgs {
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
  /** Parent/account context the read partner needs (AccountId, CampaignId, etc.). */
  readParams: Record<string, unknown>;
}

export async function runMsAdsUpdateDryRun(
  input: MsAdsDryRunArgs,
  service: MsAdsServiceLike,
  context: RequestContext
): Promise<DryRunResult> {
  const validationErrors = symbolicValidate(input.data);

  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";

  // A read failure propagates: a governed dry-run that cannot simulate must
  // fail the call (see assertGovernedDryRunResult below), not swallow the
  // error and return an incomplete payload the governance layer would reject.
  if (ENTITY_KIND_MAP[input.entityType] && service.getEntity) {
    const { entities } = await service.getEntity(
      input.entityType,
      [input.entityId],
      input.readParams,
      context
    );
    const current = entities?.[0] as Record<string, unknown> | undefined;
    if (current && typeof current === "object") {
      const snapshot = buildMsAdsSnapshot(input.entityType, input.entityId, current, input.data);
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
    "msads_update_entity"
  );
}
