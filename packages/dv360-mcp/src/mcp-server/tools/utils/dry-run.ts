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
 *   `campaign`. Other entity types return `expectedStateSource: "none"`.
 */

import type {
  DryRunResult,
  DryRunValidationError,
  NormalizedEntitySnapshot,
  CanonicalEntityKind,
  CanonicalStatus,
  RequestContext,
} from "@cesteral/shared";

interface Dv360ServiceLike {
  getEntity?: (
    entityType: string,
    ids: Record<string, string>,
    context?: RequestContext
  ) => Promise<unknown>;
}

const ENTITY_KIND_MAP: Record<string, CanonicalEntityKind> = {
  campaign: "campaign",
  insertionOrder: "insertion_order",
  lineItem: "line_item",
};

const STATUS_MAP: Record<string, CanonicalStatus> = {
  ENTITY_STATUS_ACTIVE: "active",
  ENTITY_STATUS_PAUSED: "paused",
  ENTITY_STATUS_ARCHIVED: "archived",
  ENTITY_STATUS_DELETED: "deleted",
  ENTITY_STATUS_DRAFT: "unknown",
  ENTITY_STATUS_SCHEDULED_FOR_DELETION: "deleted",
};

function normalizeStatus(raw: unknown): { canonical: CanonicalStatus; platformRaw: string } {
  const platformRaw = typeof raw === "string" ? raw : "";
  return { canonical: STATUS_MAP[platformRaw] ?? "unknown", platformRaw };
}

/**
 * Apply a dotted-path overlay onto a base object. Mutates `out` in place
 * for the path; non-leaf segments are created when missing.
 */
function setPath(out: Record<string, any>, path: string, value: unknown): void {
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

function getPath(obj: Record<string, any>, path: string): unknown {
  const parts = path.split(".");
  let cursor: any = obj;
  for (const part of parts) {
    cursor = cursor?.[part];
    if (cursor == null) return cursor;
  }
  return cursor;
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function microsToMinor(micros: unknown): number | undefined {
  if (micros == null) return undefined;
  const n = typeof micros === "string" ? Number(micros) : Number(micros);
  if (!Number.isFinite(n)) return undefined;
  // micros → minor units (cents). 1,000,000 micros = $1.00 = 100 cents.
  return Math.round(n / 10000);
}

function buildSnapshot(
  entityType: string,
  ids: Record<string, string>,
  current: Record<string, unknown>,
  applied: Record<string, unknown>
): NormalizedEntitySnapshot | null {
  const entityKind = ENTITY_KIND_MAP[entityType];
  if (!entityKind) return null;

  const platformEntityId =
    ids.lineItemId ?? ids.insertionOrderId ?? ids.campaignId ?? ids.advertiserId ?? "";

  const merged = applied as Record<string, any>;
  const currency =
    (typeof merged?.budget?.budgetUnit === "string" && merged.budget.budgetUnit) ===
    "BUDGET_UNIT_CURRENCY"
      ? "USD" // currency isn't carried on the entity directly; advertiser scope. Default to USD for round-1.
      : "USD";

  // Aggregate budget segments if present.
  const segments: Array<{
    amountMinor: number;
    currency: string;
    startAt: string | null;
    endAt: string | null;
  }> = [];
  const segArr = merged?.budget?.budgetSegments;
  if (Array.isArray(segArr)) {
    for (const seg of segArr) {
      const amountMinor = microsToMinor(seg?.budgetAmountMicros);
      if (amountMinor == null) continue;
      const start = seg?.dateRange?.startDate;
      const end = seg?.dateRange?.endDate;
      const startAt = start
        ? `${start.year}-${String(start.month).padStart(2, "0")}-${String(start.day).padStart(2, "0")}`
        : null;
      const endAt = end
        ? `${end.year}-${String(end.month).padStart(2, "0")}-${String(end.day).padStart(2, "0")}`
        : null;
      segments.push({ amountMinor, currency, startAt, endAt });
    }
  }
  const lifetimeMinor = segments.reduce((sum, s) => sum + s.amountMinor, 0);

  const flightStart = merged?.flight?.dateRange?.startDate;
  const flightEnd = merged?.flight?.dateRange?.endDate;

  return {
    schemaVersion: 1,
    platform: "dv360",
    entityKind,
    platformEntityId,
    displayName: typeof merged.displayName === "string" ? merged.displayName : null,
    accountId: typeof ids.advertiserId === "string" ? ids.advertiserId : null,
    status: normalizeStatus(merged.entityStatus ?? current.entityStatus),
    budget: {
      daily: null,
      lifetime: lifetimeMinor > 0 ? { amountMinor: lifetimeMinor, currency } : null,
      segments: segments.length > 0 ? segments : null,
    },
    schedule: {
      startAt: flightStart
        ? `${flightStart.year}-${String(flightStart.month).padStart(2, "0")}-${String(flightStart.day).padStart(2, "0")}`
        : null,
      endAt: flightEnd
        ? `${flightEnd.year}-${String(flightEnd.month).padStart(2, "0")}-${String(flightEnd.day).padStart(2, "0")}`
        : null,
    },
  };
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

  if (dv360Service.getEntity) {
    try {
      current = (await dv360Service.getEntity(input.entityType, input.ids, context)) as Record<
        string,
        any
      >;
    } catch {
      // Read failed — we can still validate the patch standalone, but we
      // cannot produce an expectedPostState.
    }
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
    const snapshot = buildSnapshot(input.entityType, input.ids, current, applied);
    if (snapshot) {
      expectedPostState = snapshot;
      expectedStateSource = "server_symbolic_apply";
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
