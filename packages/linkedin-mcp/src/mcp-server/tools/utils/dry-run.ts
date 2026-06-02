// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Dry-run helpers for the LinkedIn `update_entity` tool. R3-U3 wiring.
 *
 * LinkedIn exposes NO native validate / preview / draft mode for entity
 * mutations — `/v2/adCampaigns/{urn}` is a plain partial-update endpoint. So
 * both axes here are SYMBOLIC:
 *
 * - **Validation** runs a small set of business rules (status enum, budget
 *   non-negativity) against the requested patch. `validationSource: "symbolic"`.
 * - **Expected post-state** reads the current entity through the read partner
 *   and shallow-merges the patch (LinkedIn `$set` partial-update replaces
 *   provided fields), then normalizes.
 *   `expectedStateSource: "server_symbolic_apply"`.
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
  buildLinkedInSnapshot,
  ENTITY_KIND_MAP,
  type LinkedInServiceLike,
} from "./capture-snapshot.js";

export type { LinkedInServiceLike };

const VALID_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "ARCHIVED",
  "COMPLETED",
  "CANCELED",
  "DRAFT",
  "PENDING_DELETION",
  "REMOVED",
];

/** Symbolic validation of the requested patch. Pure (no I/O). */
function symbolicValidate(data: Record<string, unknown>): DryRunValidationError[] {
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

  for (const key of ["dailyBudget", "totalBudget"] as const) {
    if (key in data && data[key] != null) {
      const budget = data[key];
      const raw = typeof budget === "object" ? (budget as Record<string, unknown>).amount : budget;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        errors.push({
          code: "INVALID_BUDGET",
          message: `${key}.amount must be a non-negative number (major-units decimal string)`,
          field: `data.${key}`,
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
export function applyLinkedInPatch(
  entityType: string,
  entityUrn: string,
  preState: Record<string, unknown>,
  data: Record<string, unknown>
): NormalizedEntitySnapshot | undefined {
  const snapshot = buildLinkedInSnapshot(entityType, entityUrn, preState, data);
  return snapshot ?? undefined;
}

/**
 * Resolve the concrete `(operation, entityKind)` a `linkedin_update_entity`
 * call dispatches to, from its `data` payload. The tool is a multi-operation
 * dispatcher; governance requires every response to name the capability the
 * call exercised. Pure (no I/O).
 */
export function resolveLinkedInDispatchedCapability(
  entityType: string,
  data: Record<string, unknown>
): DispatchedCapability {
  const status = typeof data.status === "string" ? data.status : undefined;
  let operation: string;
  if (status === "ACTIVE") {
    operation = "resume";
  } else if (status === "PAUSED") {
    operation = "pause";
  } else if (status) {
    // ARCHIVED and any other status transition.
    operation = "update_status";
  } else if ("dailyBudget" in data || "totalBudget" in data) {
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
 * Resolve the `(operation, entityKind)` for a `linkedin_delete_entity` call.
 * Out-of-scope types (campaignGroup, creative, …) resolve to
 * `canonicalEntityKind: null` — still token-gated under enforce, no canonical
 * snapshot. Pure.
 */
export function resolveLinkedInDeleteCapability(entityType: string): DispatchedCapability {
  return {
    operation: "delete",
    canonicalEntityKind: ENTITY_KIND_MAP[entityType] ?? null,
  };
}

export interface LinkedInDeleteDryRunArgs {
  entityType: string;
  entityUrn: string;
}

/**
 * Symbolic dry-run for `linkedin_delete_entity`. Validation is symbolic; the
 * expected post-state is the current entity with status `REMOVED` (canonical
 * `deleted`). LinkedIn rejects deleting an ACTIVE campaign (must be paused
 * first), so a governed dry-run surfaces that rather than approving a delete
 * the real API will reject.
 */
export async function runLinkedInDeleteDryRun(
  args: LinkedInDeleteDryRunArgs,
  service: LinkedInServiceLike,
  context: RequestContext
): Promise<DryRunResult> {
  const validationErrors: DryRunValidationError[] = [];
  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";

  if (ENTITY_KIND_MAP[args.entityType] && service.getEntity) {
    const current = (await service.getEntity(args.entityType, args.entityUrn, context)) as Record<
      string,
      unknown
    >;
    if (current && typeof current === "object") {
      if (current.status === "ACTIVE") {
        validationErrors.push({
          code: "ACTIVE_NOT_DELETABLE",
          message: "ACTIVE campaigns must be paused before deletion",
          field: "status",
        });
      }
      const snapshot = buildLinkedInSnapshot(args.entityType, args.entityUrn, current, {
        status: "REMOVED",
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
    "linkedin_delete_entity"
  );
}

/**
 * Resolve the `(operation, entityKind)` for a `linkedin_create_entity` call.
 * Out-of-scope types (campaignGroup, creative) resolve to null. Pure.
 */
export function resolveLinkedInCreateCapability(entityType: string): DispatchedCapability {
  return {
    operation: "create",
    canonicalEntityKind: ENTITY_KIND_MAP[entityType] ?? null,
  };
}

export interface LinkedInCreateDryRunArgs {
  entityType: string;
  data: Record<string, unknown>;
}

/**
 * Symbolic dry-run for `linkedin_create_entity`. No pre-state; the expected
 * post-state is the would-be-created entity (the `data` payload normalized via
 * `buildLinkedInSnapshot`, empty pre-state). `platformEntityId` is empty — the
 * server assigns the real URN on execute.
 */
export async function runLinkedInCreateDryRun(
  args: LinkedInCreateDryRunArgs,
  _service: LinkedInServiceLike,
  _context: RequestContext
): Promise<DryRunResult> {
  const validationErrors = symbolicValidate(args.data);
  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";
  if (ENTITY_KIND_MAP[args.entityType]) {
    const snapshot = buildLinkedInSnapshot(args.entityType, "", {}, args.data);
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
    "linkedin_create_entity"
  );
}

export interface LinkedInDryRunArgs {
  entityType: string;
  entityUrn: string;
  data: Record<string, unknown>;
}

export async function runLinkedInUpdateDryRun(
  input: LinkedInDryRunArgs,
  service: LinkedInServiceLike,
  context: RequestContext
): Promise<DryRunResult> {
  const validationErrors = symbolicValidate(input.data);

  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";

  // A read failure propagates: a governed dry-run that cannot simulate must
  // fail the call (see assertGovernedDryRunResult below), not swallow the
  // error and return an incomplete payload the governance layer would reject.
  if (ENTITY_KIND_MAP[input.entityType] && service.getEntity) {
    const current = (await service.getEntity(input.entityType, input.entityUrn, context)) as
      | Record<string, unknown>
      | undefined;
    if (current && typeof current === "object") {
      const snapshot = buildLinkedInSnapshot(
        input.entityType,
        input.entityUrn,
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
    "linkedin_update_entity"
  );
}

/**
 * Resolve the `(duplicate, entityKind)` for a `linkedin_duplicate_entity` call.
 * Out-of-scope types (campaignGroup, creative) resolve to `canonicalEntityKind:
 * null` — token-gated, no canonical snapshot. Pure.
 */
export function resolveLinkedInDuplicateCapability(entityType: string): DispatchedCapability {
  return {
    operation: "duplicate",
    canonicalEntityKind: ENTITY_KIND_MAP[entityType] ?? null,
  };
}

export interface LinkedInDuplicateDryRunArgs {
  entityType: string;
  /** URN of the SOURCE entity being duplicated. */
  entityUrn: string;
  /** Custom name for the copy; defaults to `Copy of {source name}`. */
  newName?: string;
}

/**
 * Symbolic dry-run for `linkedin_duplicate_entity`. The copy does not exist yet
 * (no `before`). LinkedIn has no native copy API — the tool re-creates the
 * entity in DRAFT and renames it (`newName`, or `Copy of {source name}`) — so
 * the expected post-state is the SOURCE re-projected as the copy: read the
 * source, overlay `status: "DRAFT"` plus the copy's name, and emit it with an
 * empty `platformEntityId` (the new URN is assigned on execute). Out-of-scope
 * kinds are token-gated but not snapshot-governed.
 */
export async function runLinkedInDuplicateDryRun(
  args: LinkedInDuplicateDryRunArgs,
  service: LinkedInServiceLike,
  context: RequestContext
): Promise<DryRunResult> {
  const validationErrors: DryRunValidationError[] = [];
  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";

  const inScope = Boolean(ENTITY_KIND_MAP[args.entityType]);
  if (inScope && service.getEntity) {
    const source = (await service.getEntity(args.entityType, args.entityUrn, context)) as
      | Record<string, unknown>
      | undefined;
    if (source && typeof source === "object") {
      // The tool renames the copy before creating it (mirror that here).
      const sourceName = typeof source.name === "string" ? source.name : undefined;
      const copyName = args.newName ?? (sourceName != null ? `Copy of ${sourceName}` : undefined);
      const overlay = { status: "DRAFT", ...(copyName != null ? { name: copyName } : {}) };
      const snapshot = buildLinkedInSnapshot(args.entityType, "", source, overlay);
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
  return inScope ? assertGovernedDryRunResult(result, "linkedin_duplicate_entity") : result;
}
